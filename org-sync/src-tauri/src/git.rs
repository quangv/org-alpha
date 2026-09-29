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

pub fn clone(url: &str, path: &str) -> Result<(), String> {
    let dir_empty = std::fs::read_dir(path)
        .map(|mut d| d.next().is_none())
        .unwrap_or(true);

    if dir_empty {
        let out = Command::new("git")
            .args(["clone", url, path])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
    } else {
        // existing non-empty folder: init, set remote, fetch, reset to match remote
        let out = Command::new("git").args(["init", path]).output().map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        set_remote(path, url)?;
        let fetch = Command::new("git").arg("-C").arg(path).args(["fetch", "origin"]).output().map_err(|e| e.to_string())?;
        if !fetch.status.success() {
            return Err(String::from_utf8_lossy(&fetch.stderr).trim().to_string());
        }
        let reset = Command::new("git").arg("-C").arg(path).args(["reset", "--hard", "origin/HEAD"]).output().map_err(|e| e.to_string())?;
        if !reset.status.success() {
            return Err(String::from_utf8_lossy(&reset.stderr).trim().to_string());
        }
    }
    Ok(())
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

pub fn sync(repo: &str, message: &str) -> Result<String, String> {
    let status = git(repo, &["status", "--porcelain"])?;
    if status.is_empty() {
        return Ok("up to date".to_string());
    }
    git(repo, &["add", "."])?;
    git(repo, &["commit", "-m", message])?;
    git(repo, &["push", "-u", "origin", "HEAD"])?;
    Ok("synced".to_string())
}
