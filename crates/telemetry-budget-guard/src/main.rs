use clap::{Parser, Subcommand};
use std::path::PathBuf;
use telemetry_budget_guard::{CheckOptions, GuardError, check_paths, render_human};

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
        /// Keep body/prompt-like fields in memory for this estimate (unsafe by default).
        #[arg(long)]
        allow_sensitive: bool,
    },
}

fn main() {
    let cli = Cli::parse();
    let result = match cli.command {
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
