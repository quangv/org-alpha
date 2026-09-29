use std::path::Path;
use std::process::Command;

fn git(repo: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

pub fn is_git_repo(path: &str) -> bool {
    Path::new(path).join(".git").exists()
}

pub fn init(path: &str) -> Result<(), String> {
    let out = Command::new("git")
        .arg("init")
        .arg(path)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

pub fn set_remote(repo: &str, url: &str) -> Result<(), String> {
    let remotes = git(repo, &["remote"])?;
    if remotes.lines().any(|r| r == "origin") {
        git(repo, &["remote", "set-url", "origin", url])?;
    } else {
        git(repo, &["remote", "add", "origin", url])?;
    }
    Ok(())
}

pub fn sync(repo: &str, message: &str) -> Result<(), String> {
    let status = git(repo, &["status", "--porcelain"])?;
    if status.is_empty() {
        return Ok(());
    }
    git(repo, &["add", "."])?;
    git(repo, &["commit", "-m", message])?;
    git(repo, &["push"])?;
    Ok(())
}
