use std::process::Command;

#[test]
fn documented_example_emits_json_and_fails_changed_budget() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = Command::new(env!("CARGO_BIN_EXE_telemetry-budget-guard"))
        .current_dir(&root)
        .args([
            "check",
            "--sample",
            "fixtures/otlp-sample.json",
            "--baseline",
            "fixtures/collector-baseline.yaml",
            "--proposed",
            "fixtures/collector-proposed.yaml",
            "--budget",
            "fixtures/budget.toml",
            "--json",
        ])
        .output()
        .expect("CLI runs");

    assert_eq!(output.status.code(), Some(2));
    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("valid JSON report");
    assert_eq!(report["passed"], false);
    assert_eq!(report["heuristic"], true);
    assert_eq!(report["privacy"]["sample_persisted"], false);
    assert!(
        report["privacy"]["sensitive_fields_redacted"]
            .as_u64()
            .unwrap()
            >= 3
    );
    assert!(
        report["violations"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["metric"] == "monthly_ingest_delta")
    );
}

#[test]
fn empty_sample_exits_one_with_an_actionable_error() {
    let temp = tempfile::NamedTempFile::new().unwrap();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = Command::new(env!("CARGO_BIN_EXE_telemetry-budget-guard"))
        .current_dir(&root)
        .args(["check", "--sample"])
        .arg(temp.path())
        .args([
            "--baseline",
            "fixtures/collector-baseline.yaml",
            "--proposed",
            "fixtures/collector-proposed.yaml",
            "--budget",
            "fixtures/budget.toml",
        ])
        .output()
        .expect("CLI runs");
    assert_eq!(output.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&output.stderr).contains("contains no spans"));
}
