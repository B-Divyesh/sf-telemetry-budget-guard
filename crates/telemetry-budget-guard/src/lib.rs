use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use serde_yaml::{Mapping as YamlMap, Value as YamlValue};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Path, PathBuf};

const GIB: f64 = 1_073_741_824.0;
const MONTH_SECONDS: f64 = 30.0 * 86_400.0;
const MAX_SAMPLE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_RECORDS: usize = 1_000_000;

#[derive(Debug)]
pub enum GuardError {
    Io(PathBuf, std::io::Error),
    Invalid(String),
}

impl Display for GuardError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(path, error) => write!(f, "could not read {}: {error}", path.display()),
            Self::Invalid(message) => write!(f, "invalid input: {message}"),
        }
    }
}

impl std::error::Error for GuardError {}

#[derive(Debug)]
pub struct CheckOptions {
    pub sample: PathBuf,
    pub baseline: PathBuf,
    pub proposed: PathBuf,
    pub budget: PathBuf,
    pub allow_sensitive: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Budget {
    pub limits: Limits,
    #[serde(default)]
    pub assumptions: Assumptions,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Limits {
    pub sample_window_seconds: f64,
    pub monthly_ingest_gib: Option<f64>,
    pub retained_storage_gib: Option<f64>,
    pub monthly_egress_gib: Option<f64>,
    pub active_metric_series: Option<u64>,
    pub max_attribute_cardinality: Option<u64>,
    pub max_delta_percent: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct Assumptions {
    pub retention_days: u32,
    pub compression_ratio: f64,
    pub replicas: u32,
}

impl Default for Assumptions {
    fn default() -> Self {
        Self {
            retention_days: 30,
            compression_ratio: 0.35,
            replicas: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Estimate {
    pub observed_records: u64,
    pub projected_monthly_records: u64,
    pub monthly_ingest_gib: f64,
    pub retained_storage_gib: f64,
    pub monthly_egress_gib: f64,
    pub active_metric_series: u64,
    pub max_attribute_cardinality: u64,
    pub highest_cardinality_attribute: Option<String>,
    pub by_signal: BTreeMap<String, SignalEstimate>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct SignalEstimate {
    pub observed_records: u64,
    pub monthly_ingest_gib: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Delta {
    pub monthly_ingest_percent: Option<f64>,
    pub retained_storage_percent: Option<f64>,
    pub monthly_egress_percent: Option<f64>,
    pub active_metric_series_percent: Option<f64>,
    pub max_attribute_cardinality_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Violation {
    pub metric: String,
    pub actual: f64,
    pub limit: f64,
    pub unit: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrivacySummary {
    pub sensitive_fields_redacted: u64,
    pub sensitive_fields_included: bool,
    pub sample_persisted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Report {
    pub schema_version: String,
    pub passed: bool,
    pub heuristic: bool,
    pub sample_window_seconds: f64,
    pub baseline: Estimate,
    pub proposed: Estimate,
    pub delta: Delta,
    pub violations: Vec<Violation>,
    pub warnings: Vec<String>,
    pub privacy: PrivacySummary,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Signal {
    Span,
    Log,
    Metric,
}

impl Signal {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Span => "spans",
            Self::Log => "logs",
            Self::Metric => "metrics",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "span" | "spans" | "trace" | "traces" => Some(Self::Span),
            "log" | "logs" => Some(Self::Log),
            "metric" | "metrics" => Some(Self::Metric),
            _ => None,
        }
    }

    fn pipeline_prefix(&self) -> &'static str {
        match self {
            Self::Span => "traces",
            Self::Log => "logs",
            Self::Metric => "metrics",
        }
    }
}

#[derive(Debug, Clone)]
struct Record {
    signal: Signal,
    name: String,
    attributes: BTreeMap<String, String>,
    timestamp: Option<u64>,
    sample_factor: f64,
}

#[derive(Debug, Default)]
struct ParsedSample {
    records: Vec<Record>,
    redacted: u64,
}

pub fn check_paths(options: CheckOptions) -> Result<Report, GuardError> {
    bounded_file(&options.sample)?;
    let sample_text = read(&options.sample)?;
    let baseline_text = read(&options.baseline)?;
    let proposed_text = read(&options.proposed)?;
    let budget_text = read(&options.budget)?;
    let budget: Budget = toml::from_str(&budget_text).map_err(|e| {
        GuardError::Invalid(format!(
            "{} is not valid budget TOML: {e}",
            options.budget.display()
        ))
    })?;
    validate_budget(&budget)?;
    let parsed = parse_sample(&sample_text, options.allow_sensitive)?;
    if parsed.records.is_empty() {
        return Err(GuardError::Invalid(
            "the sample contains no spans, logs, or metric points".into(),
        ));
    }
    if parsed.records.len() > MAX_RECORDS {
        return Err(GuardError::Invalid(format!(
            "sample has more than {MAX_RECORDS} records"
        )));
    }
    let baseline_yaml: YamlValue = serde_yaml::from_str(&baseline_text).map_err(|e| {
        GuardError::Invalid(format!(
            "{} is not valid Collector YAML: {e}",
            options.baseline.display()
        ))
    })?;
    let proposed_yaml: YamlValue = serde_yaml::from_str(&proposed_text).map_err(|e| {
        GuardError::Invalid(format!(
            "{} is not valid Collector YAML: {e}",
            options.proposed.display()
        ))
    })?;

    let mut warnings = BTreeSet::new();
    let baseline_records =
        apply_collector(&parsed.records, &baseline_yaml, "baseline", &mut warnings)?;
    let proposed_records =
        apply_collector(&parsed.records, &proposed_yaml, "proposed", &mut warnings)?;
    let baseline = estimate(&baseline_records, &budget);
    let proposed = estimate(&proposed_records, &budget);
    let delta = compute_delta(&baseline, &proposed);
    let violations = violations(&proposed, &delta, &budget.limits);

    Ok(Report {
        schema_version: "1".into(),
        passed: violations.is_empty(),
        heuristic: true,
        sample_window_seconds: budget.limits.sample_window_seconds,
        baseline,
        proposed,
        delta,
        violations,
        warnings: warnings.into_iter().collect(),
        privacy: PrivacySummary {
            sensitive_fields_redacted: parsed.redacted,
            sensitive_fields_included: options.allow_sensitive,
            sample_persisted: false,
        },
    })
}

fn read(path: &Path) -> Result<String, GuardError> {
    fs::read_to_string(path).map_err(|e| GuardError::Io(path.to_owned(), e))
}

fn bounded_file(path: &Path) -> Result<(), GuardError> {
    let metadata = fs::metadata(path).map_err(|e| GuardError::Io(path.to_owned(), e))?;
    if metadata.len() > MAX_SAMPLE_BYTES {
        return Err(GuardError::Invalid(format!(
            "sample exceeds the {} MiB safety limit",
            MAX_SAMPLE_BYTES / 1024 / 1024
        )));
    }
    Ok(())
}

fn validate_budget(budget: &Budget) -> Result<(), GuardError> {
    if !budget.limits.sample_window_seconds.is_finite()
        || budget.limits.sample_window_seconds <= 0.0
    {
        return Err(GuardError::Invalid(
            "limits.sample_window_seconds must be greater than zero".into(),
        ));
    }
    if budget.assumptions.replicas == 0 {
        return Err(GuardError::Invalid(
            "assumptions.replicas must be at least 1".into(),
        ));
    }
    if !(0.0..=1.0).contains(&budget.assumptions.compression_ratio)
        || budget.assumptions.compression_ratio == 0.0
    {
        return Err(GuardError::Invalid(
            "assumptions.compression_ratio must be in (0, 1]".into(),
        ));
    }
    Ok(())
}

fn parse_sample(text: &str, allow_sensitive: bool) -> Result<ParsedSample, GuardError> {
    if let Ok(value) = serde_json::from_str::<JsonValue>(text) {
        return parse_json_value(&value, allow_sensitive);
    }
    let mut parsed = ParsedSample::default();
    for (index, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let value: JsonValue = serde_json::from_str(line).map_err(|e| {
            GuardError::Invalid(format!("JSONL line {} is invalid: {e}", index + 1))
        })?;
        parse_compact(&value, allow_sensitive, &mut parsed)?;
    }
    Ok(parsed)
}

fn parse_json_value(value: &JsonValue, allow_sensitive: bool) -> Result<ParsedSample, GuardError> {
    let mut parsed = ParsedSample::default();
    match value {
        JsonValue::Array(items) => {
            for item in items {
                parse_compact(item, allow_sensitive, &mut parsed)?;
            }
        }
        JsonValue::Object(map) if map.contains_key("signal") => {
            parse_compact(value, allow_sensitive, &mut parsed)?
        }
        JsonValue::Object(_) => parse_otlp(value, allow_sensitive, &mut parsed),
        _ => {
            return Err(GuardError::Invalid(
                "sample root must be an OTLP object, record object, array, or JSONL".into(),
            ));
        }
    }
    Ok(parsed)
}

fn parse_compact(
    value: &JsonValue,
    allow_sensitive: bool,
    out: &mut ParsedSample,
) -> Result<(), GuardError> {
    let map = value.as_object().ok_or_else(|| {
        GuardError::Invalid("each compact sample record must be an object".into())
    })?;
    let signal_text = map
        .get("signal")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| {
            GuardError::Invalid("compact sample record is missing string field 'signal'".into())
        })?;
    let signal = Signal::parse(signal_text)
        .ok_or_else(|| GuardError::Invalid(format!("unsupported signal '{signal_text}'")))?;
    let name = map
        .get("name")
        .and_then(JsonValue::as_str)
        .unwrap_or("unnamed")
        .to_owned();
    let mut attributes = compact_attributes(map.get("attributes"));
    if allow_sensitive {
        if let Some(body) = map.get("body") {
            attributes.insert("telemetry.body".into(), scalar(body));
        }
    } else {
        if map.contains_key("body") {
            out.redacted += 1;
        }
        redact(&mut attributes, &mut out.redacted);
    }
    out.records.push(Record {
        signal,
        name,
        attributes,
        timestamp: parse_timestamp(map),
        sample_factor: 1.0,
    });
    Ok(())
}

fn parse_otlp(root: &JsonValue, allow_sensitive: bool, out: &mut ParsedSample) {
    let Some(map) = root.as_object() else { return };
    parse_resource_group(
        map.get("resourceSpans"),
        "scopeSpans",
        "spans",
        Signal::Span,
        allow_sensitive,
        out,
    );
    parse_resource_group(
        map.get("resourceLogs"),
        "scopeLogs",
        "logRecords",
        Signal::Log,
        allow_sensitive,
        out,
    );
    parse_resource_metrics(map.get("resourceMetrics"), allow_sensitive, out);
}

fn parse_resource_group(
    groups: Option<&JsonValue>,
    scopes_key: &str,
    records_key: &str,
    signal: Signal,
    allow_sensitive: bool,
    out: &mut ParsedSample,
) {
    let Some(groups) = groups.and_then(JsonValue::as_array) else {
        return;
    };
    for group in groups {
        let resource = group.get("resource").and_then(|v| v.get("attributes"));
        let resource_attrs = otlp_attributes(resource);
        let Some(scopes) = group.get(scopes_key).and_then(JsonValue::as_array) else {
            continue;
        };
        for scope in scopes {
            let Some(records) = scope.get(records_key).and_then(JsonValue::as_array) else {
                continue;
            };
            for item in records {
                let mut attributes = resource_attrs.clone();
                attributes.extend(otlp_attributes(item.get("attributes")));
                let name = item
                    .get("name")
                    .and_then(JsonValue::as_str)
                    .or_else(|| item.get("severityText").and_then(JsonValue::as_str))
                    .unwrap_or(if signal == Signal::Log {
                        "log record"
                    } else {
                        "unnamed span"
                    })
                    .to_owned();
                if signal == Signal::Log {
                    if allow_sensitive {
                        if let Some(body) = item.get("body") {
                            attributes.insert("telemetry.body".into(), any_value(body));
                        }
                    } else if item.get("body").is_some() {
                        out.redacted += 1;
                    }
                }
                if !allow_sensitive {
                    redact(&mut attributes, &mut out.redacted);
                }
                out.records.push(Record {
                    signal: signal.clone(),
                    name,
                    attributes,
                    timestamp: parse_timestamp(item.as_object().unwrap_or(&JsonMap::new())),
                    sample_factor: 1.0,
                });
            }
        }
    }
}

fn parse_resource_metrics(
    groups: Option<&JsonValue>,
    allow_sensitive: bool,
    out: &mut ParsedSample,
) {
    let Some(groups) = groups.and_then(JsonValue::as_array) else {
        return;
    };
    for group in groups {
        let resource_attrs =
            otlp_attributes(group.get("resource").and_then(|v| v.get("attributes")));
        let Some(scopes) = group.get("scopeMetrics").and_then(JsonValue::as_array) else {
            continue;
        };
        for scope in scopes {
            let Some(metrics) = scope.get("metrics").and_then(JsonValue::as_array) else {
                continue;
            };
            for metric in metrics {
                let name = metric
                    .get("name")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("unnamed metric")
                    .to_owned();
                for kind in [
                    "gauge",
                    "sum",
                    "histogram",
                    "exponentialHistogram",
                    "summary",
                ] {
                    let Some(points) = metric
                        .get(kind)
                        .and_then(|v| v.get("dataPoints"))
                        .and_then(JsonValue::as_array)
                    else {
                        continue;
                    };
                    for point in points {
                        let mut attributes = resource_attrs.clone();
                        attributes.extend(otlp_attributes(point.get("attributes")));
                        if !allow_sensitive {
                            redact(&mut attributes, &mut out.redacted);
                        }
                        out.records.push(Record {
                            signal: Signal::Metric,
                            name: name.clone(),
                            attributes,
                            timestamp: point.as_object().and_then(|m| parse_timestamp(m)),
                            sample_factor: 1.0,
                        });
                    }
                }
            }
        }
    }
}

fn compact_attributes(value: Option<&JsonValue>) -> BTreeMap<String, String> {
    value
        .and_then(JsonValue::as_object)
        .map(|map| {
            map.iter()
                .map(|(key, value)| (key.clone(), scalar(value)))
                .collect()
        })
        .unwrap_or_default()
}

fn otlp_attributes(value: Option<&JsonValue>) -> BTreeMap<String, String> {
    let mut result = BTreeMap::new();
    let Some(items) = value.and_then(JsonValue::as_array) else {
        return result;
    };
    for item in items {
        if let (Some(key), Some(value)) = (
            item.get("key").and_then(JsonValue::as_str),
            item.get("value"),
        ) {
            result.insert(key.to_owned(), any_value(value));
        }
    }
    result
}

fn any_value(value: &JsonValue) -> String {
    let Some(map) = value.as_object() else {
        return scalar(value);
    };
    for key in [
        "stringValue",
        "intValue",
        "doubleValue",
        "boolValue",
        "bytesValue",
    ] {
        if let Some(inner) = map.get(key) {
            return scalar(inner);
        }
    }
    serde_json::to_string(value).unwrap_or_default()
}

fn scalar(value: &JsonValue) -> String {
    match value {
        JsonValue::String(v) => v.clone(),
        JsonValue::Null => "null".into(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn parse_timestamp(map: &JsonMap<String, JsonValue>) -> Option<u64> {
    ["timestamp_unix_nano", "timeUnixNano", "startTimeUnixNano"]
        .iter()
        .find_map(|key| map.get(*key))
        .and_then(|value| match value {
            JsonValue::String(v) => v.parse().ok(),
            JsonValue::Number(v) => v.as_u64(),
            _ => None,
        })
}

fn sensitive_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    ["prompt", "body", "content", "message", "query"]
        .iter()
        .any(|part| key.contains(part))
}

fn redact(attributes: &mut BTreeMap<String, String>, count: &mut u64) {
    let before = attributes.len();
    attributes.retain(|key, _| !sensitive_key(key));
    *count += (before - attributes.len()) as u64;
}

fn apply_collector(
    records: &[Record],
    config: &YamlValue,
    label: &str,
    warnings: &mut BTreeSet<String>,
) -> Result<Vec<Record>, GuardError> {
    let processors = yaml_get(config, "processors").and_then(YamlValue::as_mapping);
    let pipelines = yaml_get(config, "service")
        .and_then(|v| yaml_get(v, "pipelines"))
        .and_then(YamlValue::as_mapping);
    let mut output = Vec::new();
    for signal in [Signal::Span, Signal::Log, Signal::Metric] {
        let chains = pipeline_chains(pipelines, &signal);
        if chains.is_empty() {
            warnings.insert(format!(
                "{label}: no {} pipeline found; records pass through unchanged",
                signal.as_str()
            ));
            output.extend(records.iter().filter(|r| r.signal == signal).cloned());
            continue;
        }
        for chain in chains {
            let mut selected: Vec<Record> = records
                .iter()
                .filter(|r| r.signal == signal)
                .cloned()
                .collect();
            for processor_name in chain {
                let config = processors.and_then(|m| yaml_map_get(m, &processor_name));
                selected = apply_processor(selected, &processor_name, config, label, warnings)?;
            }
            output.extend(selected);
        }
    }
    Ok(output)
}

fn pipeline_chains(pipelines: Option<&YamlMap>, signal: &Signal) -> Vec<Vec<String>> {
    let Some(pipelines) = pipelines else {
        return Vec::new();
    };
    pipelines
        .iter()
        .filter_map(|(key, value)| {
            let name = key.as_str()?;
            if !name
                .split('/')
                .next()
                .is_some_and(|prefix| prefix == signal.pipeline_prefix())
            {
                return None;
            }
            let list = yaml_get(value, "processors").and_then(YamlValue::as_sequence)?;
            Some(
                list.iter()
                    .filter_map(YamlValue::as_str)
                    .map(str::to_owned)
                    .collect(),
            )
        })
        .collect()
}

fn apply_processor(
    mut records: Vec<Record>,
    name: &str,
    config: Option<&YamlValue>,
    label: &str,
    warnings: &mut BTreeSet<String>,
) -> Result<Vec<Record>, GuardError> {
    let kind = name.split('/').next().unwrap_or(name);
    match kind {
        "attributes" | "resource" => {
            let Some(actions) = config
                .and_then(|v| yaml_get(v, "actions"))
                .and_then(YamlValue::as_sequence)
            else {
                warnings.insert(format!("{label}: {name} has no modeled actions"));
                return Ok(records);
            };
            for record in &mut records {
                for action in actions {
                    apply_attribute_action(record, action)?;
                }
            }
        }
        "filter" => records.retain(|record| filter_keeps(record, config, name, label, warnings)),
        "probabilistic_sampler" => {
            let percentage = config
                .and_then(|v| yaml_get(v, "sampling_percentage"))
                .and_then(yaml_number)
                .unwrap_or(100.0);
            if !(0.0..=100.0).contains(&percentage) {
                return Err(GuardError::Invalid(format!(
                    "processor {name} sampling_percentage must be from 0 to 100"
                )));
            }
            for record in &mut records {
                record.sample_factor *= percentage / 100.0;
            }
        }
        "batch" | "memory_limiter" | "groupbytrace" => {}
        _ => {
            warnings.insert(format!(
                "{label}: processor {name} is not modeled and was treated as volume-neutral"
            ));
        }
    }
    Ok(records)
}

fn apply_attribute_action(record: &mut Record, value: &YamlValue) -> Result<(), GuardError> {
    let action = yaml_get(value, "action")
        .and_then(YamlValue::as_str)
        .unwrap_or("upsert");
    let key = yaml_get(value, "key")
        .and_then(YamlValue::as_str)
        .ok_or_else(|| GuardError::Invalid("attribute action is missing key".into()))?;
    let source = yaml_get(value, "from_attribute")
        .and_then(YamlValue::as_str)
        .and_then(|source| record.attributes.get(source).cloned());
    let literal = yaml_get(value, "value").map(yaml_scalar);
    let new_value = source.or(literal).unwrap_or_default();
    match action {
        "delete" => {
            record.attributes.remove(key);
        }
        "insert" if !record.attributes.contains_key(key) => {
            record.attributes.insert(key.into(), new_value);
        }
        "update" if record.attributes.contains_key(key) => {
            record.attributes.insert(key.into(), new_value);
        }
        "upsert" => {
            record.attributes.insert(key.into(), new_value);
        }
        "hash" => {
            if let Some(value) = record.attributes.get_mut(key) {
                *value = format!("{:016x}", fnv1a(value.as_bytes()));
            }
        }
        "insert" | "update" => {}
        other => {
            return Err(GuardError::Invalid(format!(
                "unsupported attribute action '{other}'"
            )));
        }
    }
    Ok(())
}

fn filter_keeps(
    record: &Record,
    config: Option<&YamlValue>,
    name: &str,
    label: &str,
    warnings: &mut BTreeSet<String>,
) -> bool {
    let Some(config) = config else { return true };
    let section_name = match record.signal {
        Signal::Span => "spans",
        Signal::Log => "logs",
        Signal::Metric => "metrics",
    };
    let section = yaml_get(config, section_name).unwrap_or(config);
    if section.as_sequence().is_some()
        || yaml_get(section, "span").is_some()
        || yaml_get(section, "log_record").is_some()
        || yaml_get(section, "metric").is_some()
    {
        warnings.insert(format!(
            "{label}: {name} uses OTTL conditions, which are not modeled; treated as pass-through"
        ));
        return true;
    }
    if let Some(include) = yaml_get(section, "include") {
        if !matches_rule(record, include) {
            return false;
        }
    }
    if let Some(exclude) = yaml_get(section, "exclude") {
        if matches_rule(record, exclude) {
            return false;
        }
    }
    true
}

fn matches_rule(record: &Record, rule: &YamlValue) -> bool {
    let match_type = yaml_get(rule, "match_type")
        .and_then(YamlValue::as_str)
        .unwrap_or("strict");
    let names_key = match record.signal {
        Signal::Span => "span_names",
        Signal::Log => "record_attributes",
        Signal::Metric => "metric_names",
    };
    let name_match = yaml_get(rule, names_key)
        .and_then(YamlValue::as_sequence)
        .map(|values| {
            values
                .iter()
                .filter_map(YamlValue::as_str)
                .any(|candidate| string_matches(&record.name, candidate, match_type))
        });
    let attr_match = yaml_get(rule, "attributes")
        .and_then(YamlValue::as_sequence)
        .map(|values| {
            values.iter().all(|item| {
                let Some(key) = yaml_get(item, "key").and_then(YamlValue::as_str) else {
                    return false;
                };
                let Some(expected) = yaml_get(item, "value") else {
                    return false;
                };
                record.attributes.get(key).is_some_and(|actual| {
                    string_matches(actual, &yaml_scalar(expected), match_type)
                })
            })
        });
    name_match.unwrap_or(true) && attr_match.unwrap_or(true)
}

fn string_matches(actual: &str, expected: &str, match_type: &str) -> bool {
    if match_type == "strict" {
        return actual == expected;
    }
    regex::Regex::new(expected)
        .map(|pattern| pattern.is_match(actual))
        .unwrap_or(false)
}

fn estimate(records: &[Record], budget: &Budget) -> Estimate {
    let window = budget.limits.sample_window_seconds;
    let replica_factor = budget.assumptions.replicas as f64;
    let compression = budget.assumptions.compression_ratio;
    let scale = MONTH_SECONDS / window * replica_factor;
    let mut weighted_records = 0.0;
    let mut weighted_bytes = 0.0;
    let mut by_signal: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    let mut series_counts: HashMap<String, u64> = HashMap::new();
    let mut attribute_values: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for record in records {
        let bytes = record_size(record) as f64 * record.sample_factor;
        weighted_records += record.sample_factor;
        weighted_bytes += bytes;
        let item = by_signal.entry(record.signal.as_str().into()).or_default();
        item.0 += record.sample_factor;
        item.1 += bytes;
        for (key, value) in &record.attributes {
            attribute_values
                .entry(key.clone())
                .or_default()
                .insert(value.clone());
        }
        if record.signal == Signal::Metric {
            let key = series_key(record);
            *series_counts.entry(key).or_default() += 1;
        }
    }
    let compressed_monthly_bytes = weighted_bytes * scale * compression;
    let daily_gib = compressed_monthly_bytes / GIB / 30.0;
    let active_metric_series = chao1(&series_counts);
    let highest = attribute_values
        .iter()
        .max_by_key(|(_, values)| values.len());
    let signal_output = by_signal
        .into_iter()
        .map(|(name, (count, bytes))| {
            (
                name,
                SignalEstimate {
                    observed_records: count.round() as u64,
                    monthly_ingest_gib: round4(bytes * scale * compression / GIB),
                },
            )
        })
        .collect();
    Estimate {
        observed_records: weighted_records.round() as u64,
        projected_monthly_records: (weighted_records * scale).round() as u64,
        monthly_ingest_gib: round4(compressed_monthly_bytes / GIB),
        retained_storage_gib: round4(daily_gib * budget.assumptions.retention_days as f64),
        monthly_egress_gib: round4(compressed_monthly_bytes / GIB),
        active_metric_series,
        max_attribute_cardinality: highest.map(|(_, values)| values.len() as u64).unwrap_or(0),
        highest_cardinality_attribute: highest.map(|(key, _)| key.clone()),
        by_signal: signal_output,
    }
}

fn record_size(record: &Record) -> usize {
    serde_json::to_vec(&json!({
        "signal": record.signal.as_str(), "name": record.name, "attributes": record.attributes,
        "timestamp_unix_nano": record.timestamp
    }))
    .map(|value| value.len())
    .unwrap_or(0)
}

fn series_key(record: &Record) -> String {
    let mut key = record.name.clone();
    for (name, value) in &record.attributes {
        key.push('\u{1f}');
        key.push_str(name);
        key.push('=');
        key.push_str(value);
    }
    key
}

fn chao1(counts: &HashMap<String, u64>) -> u64 {
    let observed = counts.len() as f64;
    let singletons = counts.values().filter(|&&count| count == 1).count() as f64;
    let doubletons = counts.values().filter(|&&count| count == 2).count() as f64;
    let unseen = if doubletons > 0.0 {
        singletons * singletons / (2.0 * doubletons)
    } else {
        singletons * (singletons - 1.0) / 2.0
    };
    (observed + unseen.max(0.0)).round() as u64
}

fn compute_delta(baseline: &Estimate, proposed: &Estimate) -> Delta {
    Delta {
        monthly_ingest_percent: percent(baseline.monthly_ingest_gib, proposed.monthly_ingest_gib),
        retained_storage_percent: percent(
            baseline.retained_storage_gib,
            proposed.retained_storage_gib,
        ),
        monthly_egress_percent: percent(baseline.monthly_egress_gib, proposed.monthly_egress_gib),
        active_metric_series_percent: percent(
            baseline.active_metric_series as f64,
            proposed.active_metric_series as f64,
        ),
        max_attribute_cardinality_percent: percent(
            baseline.max_attribute_cardinality as f64,
            proposed.max_attribute_cardinality as f64,
        ),
    }
}

fn percent(before: f64, after: f64) -> Option<f64> {
    if before == 0.0 {
        if after == 0.0 { Some(0.0) } else { None }
    } else {
        Some(round2((after - before) / before * 100.0))
    }
}

fn violations(estimate: &Estimate, delta: &Delta, limits: &Limits) -> Vec<Violation> {
    let mut result = Vec::new();
    absolute_violation(
        &mut result,
        "monthly_ingest",
        estimate.monthly_ingest_gib,
        limits.monthly_ingest_gib,
        "GiB",
    );
    absolute_violation(
        &mut result,
        "retained_storage",
        estimate.retained_storage_gib,
        limits.retained_storage_gib,
        "GiB",
    );
    absolute_violation(
        &mut result,
        "monthly_egress",
        estimate.monthly_egress_gib,
        limits.monthly_egress_gib,
        "GiB",
    );
    absolute_violation(
        &mut result,
        "active_metric_series",
        estimate.active_metric_series as f64,
        limits.active_metric_series.map(|v| v as f64),
        "series",
    );
    absolute_violation(
        &mut result,
        "max_attribute_cardinality",
        estimate.max_attribute_cardinality as f64,
        limits.max_attribute_cardinality.map(|v| v as f64),
        "values",
    );
    if let Some(limit) = limits.max_delta_percent {
        for (metric, value) in [
            ("monthly_ingest_delta", delta.monthly_ingest_percent),
            ("retained_storage_delta", delta.retained_storage_percent),
            ("monthly_egress_delta", delta.monthly_egress_percent),
            (
                "active_metric_series_delta",
                delta.active_metric_series_percent,
            ),
            (
                "max_attribute_cardinality_delta",
                delta.max_attribute_cardinality_percent,
            ),
        ] {
            match value {
                Some(actual) if actual > limit => result.push(Violation {
                    metric: metric.into(),
                    actual,
                    limit,
                    unit: "%".into(),
                    message: format!("{metric} is {actual:.2}% (limit {limit:.2}%)"),
                }),
                None => result.push(Violation {
                    metric: metric.into(),
                    actual: f64::MAX,
                    limit,
                    unit: "%".into(),
                    message: format!("{metric} increased from zero (limit {limit:.2}%)"),
                }),
                _ => {}
            }
        }
    }
    result
}

fn absolute_violation(
    result: &mut Vec<Violation>,
    metric: &str,
    actual: f64,
    limit: Option<f64>,
    unit: &str,
) {
    if let Some(limit) = limit {
        if actual > limit {
            result.push(Violation {
                metric: metric.into(),
                actual,
                limit,
                unit: unit.into(),
                message: format!("{metric} is {actual:.4} {unit} (limit {limit:.4} {unit})"),
            });
        }
    }
}

pub fn render_human(report: &Report) -> String {
    let status = if report.passed { "PASS" } else { "FAIL" };
    let mut text = format!(
        "Telemetry Budget Guard  {status}\n\n                          BASELINE       PROPOSED       DELTA\nMonthly ingest        {:>10.4} GiB  {:>10.4} GiB  {:>8}\nRetained storage      {:>10.4} GiB  {:>10.4} GiB  {:>8}\nMonthly egress        {:>10.4} GiB  {:>10.4} GiB  {:>8}\nActive metric series  {:>14}  {:>14}  {:>8}\nMax attr cardinality  {:>14}  {:>14}  {:>8}\n",
        report.baseline.monthly_ingest_gib,
        report.proposed.monthly_ingest_gib,
        display_percent(report.delta.monthly_ingest_percent),
        report.baseline.retained_storage_gib,
        report.proposed.retained_storage_gib,
        display_percent(report.delta.retained_storage_percent),
        report.baseline.monthly_egress_gib,
        report.proposed.monthly_egress_gib,
        display_percent(report.delta.monthly_egress_percent),
        report.baseline.active_metric_series,
        report.proposed.active_metric_series,
        display_percent(report.delta.active_metric_series_percent),
        report.baseline.max_attribute_cardinality,
        report.proposed.max_attribute_cardinality,
        display_percent(report.delta.max_attribute_cardinality_percent),
    );
    text.push_str(&format!(
        "\nPrivacy: {} sensitive fields redacted; sample never persisted.\n",
        report.privacy.sensitive_fields_redacted
    ));
    text.push_str(
        "Estimate: heuristic — calibrate sample_window_seconds against three releases.\n",
    );
    for violation in &report.violations {
        text.push_str(&format!("\n  ✗ {}\n", violation.message));
    }
    for warning in &report.warnings {
        text.push_str(&format!("\n  ! {warning}\n"));
    }
    text
}

fn display_percent(value: Option<f64>) -> String {
    value
        .map(|v| format!("{v:+.2}%"))
        .unwrap_or_else(|| "new".into())
}

fn yaml_get<'a>(value: &'a YamlValue, key: &str) -> Option<&'a YamlValue> {
    value.as_mapping().and_then(|map| yaml_map_get(map, key))
}

fn yaml_map_get<'a>(map: &'a YamlMap, key: &str) -> Option<&'a YamlValue> {
    map.get(YamlValue::String(key.into()))
}

fn yaml_scalar(value: &YamlValue) -> String {
    match value {
        YamlValue::String(v) => v.clone(),
        YamlValue::Bool(v) => v.to_string(),
        YamlValue::Number(v) => v.to_string(),
        YamlValue::Null => "null".into(),
        _ => serde_yaml::to_string(value)
            .unwrap_or_default()
            .trim()
            .into(),
    }
}

fn yaml_number(value: &YamlValue) -> Option<f64> {
    match value {
        YamlValue::Number(number) => number.as_f64(),
        YamlValue::String(text) => text.parse().ok(),
        _ => None,
    }
}

fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}
fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budget() -> Budget {
        Budget {
            limits: Limits {
                sample_window_seconds: 60.0,
                monthly_ingest_gib: Some(100.0),
                retained_storage_gib: Some(100.0),
                monthly_egress_gib: Some(100.0),
                active_metric_series: Some(100),
                max_attribute_cardinality: Some(100),
                max_delta_percent: Some(20.0),
            },
            assumptions: Assumptions::default(),
        }
    }

    #[test]
    fn compact_jsonl_redacts_sensitive_values() {
        let parsed = parse_sample(r#"{"signal":"log","name":"done","body":"secret","attributes":{"gen_ai.prompt":"secret","service.name":"api"}}"#, false).unwrap();
        assert_eq!(parsed.records.len(), 1);
        assert_eq!(parsed.redacted, 2);
        assert_eq!(parsed.records[0].attributes.len(), 1);
    }

    #[test]
    fn parses_otlp_metrics_and_resource_attributes() {
        let input = r#"{"resourceMetrics":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"api"}}]},"scopeMetrics":[{"metrics":[{"name":"requests","sum":{"dataPoints":[{"attributes":[{"key":"route","value":{"stringValue":"/"}}],"timeUnixNano":"10"}]}}]}]}]}"#;
        let parsed = parse_sample(input, false).unwrap();
        assert_eq!(parsed.records.len(), 1);
        assert_eq!(parsed.records[0].attributes["service.name"], "api");
    }

    #[test]
    fn collector_attribute_delete_changes_cardinality_and_bytes() {
        let records = parse_sample(r#"[{"signal":"metric","name":"requests","attributes":{"user.id":"1"}},{"signal":"metric","name":"requests","attributes":{"user.id":"2"}}]"#, false).unwrap().records;
        let config: YamlValue = serde_yaml::from_str("processors:\n  attributes/budget:\n    actions:\n      - key: user.id\n        action: delete\nservice:\n  pipelines:\n    metrics:\n      processors: [attributes/budget]\n").unwrap();
        let mut warnings = BTreeSet::new();
        let output = apply_collector(&records, &config, "test", &mut warnings).unwrap();
        assert!(output.iter().all(|r| !r.attributes.contains_key("user.id")));
        assert!(
            estimate(&output, &budget()).active_metric_series
                < estimate(&records, &budget()).active_metric_series
        );
    }

    #[test]
    fn delta_budget_fails_new_series() {
        let before = Estimate {
            observed_records: 0,
            projected_monthly_records: 0,
            monthly_ingest_gib: 0.0,
            retained_storage_gib: 0.0,
            monthly_egress_gib: 0.0,
            active_metric_series: 0,
            max_attribute_cardinality: 0,
            highest_cardinality_attribute: None,
            by_signal: BTreeMap::new(),
        };
        let mut after = before.clone();
        after.active_metric_series = 1;
        let delta = compute_delta(&before, &after);
        assert!(
            violations(&after, &delta, &budget().limits)
                .iter()
                .any(|v| v.metric == "active_metric_series_delta")
        );
    }
}
