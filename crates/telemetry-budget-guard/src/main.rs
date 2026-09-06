use clap::{Parser, Subcommand};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use telemetry_budget_guard::{CheckOptions, GuardError, check_paths, render_human};

const DEMO_SAMPLE: &str = include_str!("../examples/demo/otlp-sample.json");
const DEMO_BASELINE: &str = include_str!("../examples/demo/collector-baseline.yaml");
const DEMO_PROPOSED: &str = include_str!("../examples/demo/collector-proposed.yaml");
const DEMO_BUDGET: &str = include_str!("../examples/demo/budget.toml");

#[derive(Debug, Parser)]
#[command(
    name = "telemetry-budget-guard",
    version,
    about = "Fail CI before an OpenTelemetry change breaks your telemetry budget",
    long_about = "Compare a bounded OTLP JSON/JSONL sample under baseline and proposed OpenTelemetry Collector configs. Estimates are heuristic, local-only, and redact body/prompt-like fields by default."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Run the bundled checkout-service sample without setup or an account.
    Demo,
    /// Compare Collector configs and enforce a TOML telemetry budget.
    Check {
        /// Bounded OTLP/HTTP JSON or compact JSONL sample.
        #[arg(long, value_name = "FILE")]
        sample: PathBuf,
        /// Collector YAML representing the current production path.
        #[arg(long, value_name = "FILE")]
        baseline: PathBuf,
        /// Collector YAML proposed by this change.
        #[arg(long, value_name = "FILE")]
        proposed: PathBuf,
        /// TOML limits and projection assumptions.
        #[arg(long, value_name = "FILE")]
        budget: PathBuf,
        /// Emit one stable JSON document for CI automation.
        #[arg(long)]
        json: bool,
        /// Keep body/prompt-like fields in memory for this estimate. Use only with safe data.
        #[arg(long)]
        allow_sensitive: bool,
    },
}

fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Demo => run_demo(),
        Command::Check {
            sample,
            baseline,
            proposed,
            budget,
            json,
            allow_sensitive,
        } => check_paths(CheckOptions {
            sample,
            baseline,
            proposed,
            budget,
            allow_sensitive,
        })
        .map(|report| {
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(&report).expect("report serializes")
                );
            } else {
                println!("{}", render_human(&report));
            }
            if report.passed { 0 } else { 2 }
        }),
    };

    match result {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("telemetry-budget-guard: {error}");
            if let GuardError::Invalid(detail) = error {
                eprintln!("hint: {detail}");
            }
            std::process::exit(1);
        }
    }
}

fn run_demo() -> Result<i32, GuardError> {
    let workspace = DemoWorkspace::create()?;
    let report = check_paths(CheckOptions {
        sample: workspace.path.join("otlp-sample.json"),
        baseline: workspace.path.join("collector-baseline.yaml"),
        proposed: workspace.path.join("collector-proposed.yaml"),
        budget: workspace.path.join("budget.toml"),
        allow_sensitive: false,
    })?;
    println!("Demo — bundled checkout-service sample; temporary files are removed.\n");
    println!("{}", render_human(&report));
    println!(
        "Temporary sample directory: {} (removed when this run ends).",
        workspace.path.display()
    );
    println!("Demo outcome: budget failure expected; your CI check would exit 2.");
    Ok(0)
}

struct DemoWorkspace {
    path: PathBuf,
}

impl DemoWorkspace {
    fn create() -> Result<Self, GuardError> {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "telemetry-budget-guard-demo-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir(&path).map_err(|error| GuardError::Io(path.clone(), error))?;
        let workspace = Self { path };
        write_demo_file(&workspace.path, "otlp-sample.json", DEMO_SAMPLE)?;
        write_demo_file(&workspace.path, "collector-baseline.yaml", DEMO_BASELINE)?;
        write_demo_file(&workspace.path, "collector-proposed.yaml", DEMO_PROPOSED)?;
        write_demo_file(&workspace.path, "budget.toml", DEMO_BUDGET)?;
        Ok(workspace)
    }
}

impl Drop for DemoWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn write_demo_file(root: &Path, name: &str, contents: &str) -> Result<(), GuardError> {
    let path = root.join(name);
    fs::write(&path, contents).map_err(|error| GuardError::Io(path, error))
}
