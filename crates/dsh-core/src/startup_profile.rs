//! User-editable startup identity, independent of session and agent settings.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::Path;

const PROFILE_FILE: &str = "startup-profile.json";
const PROFILE_LOCK: &str = ".startup-profile.lock";

/// The shared UI identity, independent of the user's light/dark color preference.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VisualStyle {
    #[default]
    Rhine,
    Laterano,
}

impl std::str::FromStr for VisualStyle {
    type Err = String;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        match value {
            "rhine" => Ok(Self::Rhine),
            "laterano" => Ok(Self::Laterano),
            _ => Err("visual style must be rhine or laterano".into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct StartupProfile {
    pub username: String,
    pub badge_id: String,
    pub visual_style: VisualStyle,
}

impl Default for StartupProfile {
    fn default() -> Self {
        let username = ["USERNAME", "USER"]
            .iter()
            .filter_map(|key| std::env::var(key).ok())
            .find_map(|value| normalize_field(&value, "username").ok())
            .unwrap_or_else(|| "OPERATOR".into());
        Self {
            username,
            badge_id: "DSH-0001".into(),
            visual_style: VisualStyle::default(),
        }
    }
}

fn normalize_field(value: &str, field: &str) -> Result<String> {
    anyhow::ensure!(
        !value.chars().any(char::is_control),
        "startup {field} cannot contain control characters"
    );
    let value = value.trim();
    anyhow::ensure!(
        (1..=32).contains(&value.chars().count()),
        "startup {field} must contain 1 to 32 characters"
    );
    Ok(value.to_owned())
}

fn normalized(profile: &StartupProfile) -> Result<StartupProfile> {
    Ok(StartupProfile {
        username: normalize_field(&profile.username, "username")?,
        badge_id: normalize_field(&profile.badge_id, "badge_id")?,
        visual_style: profile.visual_style,
    })
}

fn open_lock(outer_home: &Path) -> Result<fs::File> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(outer_home.join(PROFILE_LOCK))
        .context("open startup profile lock")
}

/// Read the saved identity without constructing a runtime. A missing profile
/// returns the OS username/default badge without creating any directories.
pub fn load_startup_profile(outer_home: &Path) -> Result<StartupProfile> {
    let target = outer_home.join(PROFILE_FILE);
    if !target.try_exists().context("check startup profile")? {
        return Ok(StartupProfile::default());
    }
    let lock = open_lock(outer_home)?;
    fs2::FileExt::lock_shared(&lock).context("lock startup profile for reading")?;
    read_profile(&target)
}

fn read_profile(target: &Path) -> Result<StartupProfile> {
    let text = match fs::read_to_string(target) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(StartupProfile::default()),
        Err(error) => return Err(error).context("read startup profile"),
    };
    let profile = serde_json::from_str(&text).context("parse startup profile JSON")?;
    normalized(&profile)
}

/// Validate, trim and atomically replace the UTF-8 profile. A separate OS file
/// lock serializes readers/writers and never interacts with the one-use switch.
pub fn save_startup_profile(outer_home: &Path, profile: &StartupProfile) -> Result<()> {
    let profile = normalized(profile)?;
    fs::create_dir_all(outer_home).context("create startup profile directory")?;
    let lock = open_lock(outer_home)?;
    fs2::FileExt::lock_exclusive(&lock).context("lock startup profile for writing")?;
    write_profile(outer_home, &profile)
}

/// Update selected identity fields under one file lock so independent UI edits
/// cannot overwrite each other with stale profile snapshots.
pub fn update_startup_profile(
    outer_home: &Path,
    update: impl FnOnce(&mut StartupProfile),
) -> Result<StartupProfile> {
    fs::create_dir_all(outer_home).context("create startup profile directory")?;
    let lock = open_lock(outer_home)?;
    fs2::FileExt::lock_exclusive(&lock).context("lock startup profile for updating")?;
    let mut profile = read_profile(&outer_home.join(PROFILE_FILE))?;
    update(&mut profile);
    let profile = normalized(&profile)?;
    write_profile(outer_home, &profile)?;
    Ok(profile)
}

fn write_profile(outer_home: &Path, profile: &StartupProfile) -> Result<()> {
    let temporary = outer_home.join(format!(".startup-profile-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .context("create temporary startup profile")?;
        let mut text = serde_json::to_vec_pretty(profile)?;
        text.push(b'\n');
        file.write_all(&text)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, outer_home.join(PROFILE_FILE)).context("save startup profile")?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    struct TestHome(PathBuf);
    impl TestHome {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!("dsh-profile-test-{}", uuid::Uuid::new_v4())))
        }
    }
    impl Drop for TestHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn missing_profile_returns_defaults_without_creating_home() {
        let home = TestHome::new();
        let profile = load_startup_profile(&home.0).unwrap();
        assert!(!profile.username.is_empty());
        assert_eq!(profile.badge_id, "DSH-0001");
        assert_eq!(profile.visual_style, VisualStyle::Rhine);
        assert!(!home.0.exists());
    }

    #[test]
    fn legacy_profiles_default_to_rhine_and_selected_style_survives_normalization() {
        let home = TestHome::new();
        fs::create_dir_all(&home.0).unwrap();
        fs::write(home.0.join(PROFILE_FILE), r#"{"username":"Operator","badge_id":"DSH-LEGACY"}"#).unwrap();
        let mut profile = load_startup_profile(&home.0).unwrap();
        assert_eq!(profile.visual_style, VisualStyle::Rhine);
        profile.username = "  Laterano operator  ".into();
        profile.visual_style = VisualStyle::Laterano;
        save_startup_profile(&home.0, &profile).unwrap();
        let saved = load_startup_profile(&home.0).unwrap();
        assert_eq!(saved.username, "Laterano operator");
        assert_eq!(saved.visual_style, VisualStyle::Laterano);
        let json: serde_json::Value = serde_json::from_str(&fs::read_to_string(home.0.join(PROFILE_FILE)).unwrap()).unwrap();
        assert_eq!(json["visual_style"], "laterano");
        for invalid in [serde_json::json!("unknown"), serde_json::json!(null), serde_json::json!(42)] {
            let mut value = json.clone();
            value["visual_style"] = invalid;
            fs::write(home.0.join(PROFILE_FILE), value.to_string()).unwrap();
            assert!(load_startup_profile(&home.0).is_err());
        }
    }

    #[test]
    fn unicode_profile_is_trimmed_persisted_and_independent_of_other_settings() {
        let home = TestHome::new();
        crate::set_next_startup(&home.0, true).unwrap();
        fs::write(home.0.join("settings.toml"), "theme = 'github'\n").unwrap();
        let profile = StartupProfile {
            username: "  星海研究员🛰  ".into(),
            badge_id: "  部门-二号  ".into(),
            visual_style: VisualStyle::Rhine,
        };
        save_startup_profile(&home.0, &profile).unwrap();
        assert_eq!(
            load_startup_profile(&home.0).unwrap(),
            StartupProfile {
                username: "星海研究员🛰".into(),
                badge_id: "部门-二号".into(),
                visual_style: VisualStyle::Rhine,
            }
        );
        save_startup_profile(
            &home.0,
            &StartupProfile {
                username: "新名字".into(),
                ..profile
            },
        )
        .unwrap();
        assert_eq!(load_startup_profile(&home.0).unwrap().username, "新名字");
        assert_eq!(
            fs::read_to_string(home.0.join("settings.toml")).unwrap(),
            "theme = 'github'\n"
        );
        assert_eq!(crate::take_next_startup(&home.0).unwrap(), Some(true));
        assert!(!fs::read_dir(&home.0)
            .unwrap()
            .flatten()
            .any(|e| e.path().extension().is_some_and(|ext| ext == "tmp")));
    }

    #[test]
    fn invalid_identity_is_rejected_before_any_write() {
        let home = TestHome::new();
        for invalid in [
            " ".to_string(),
            "名字\n".into(),
            "A\u{1b}[31m".into(),
            "字".repeat(33),
        ] {
            for profile in [
                StartupProfile {
                    username: invalid.clone(),
                    badge_id: "DSH-0001".into(),
                    visual_style: VisualStyle::Rhine,
                },
                StartupProfile {
                    username: "用户".into(),
                    badge_id: invalid.clone(),
                    visual_style: VisualStyle::Rhine,
                },
            ] {
                assert!(save_startup_profile(&home.0, &profile).is_err());
            }
        }
        assert!(!home.0.exists());
        save_startup_profile(
            &home.0,
            &StartupProfile {
                username: "字".repeat(32),
                badge_id: "章".repeat(32),
                visual_style: VisualStyle::Rhine,
            },
        )
        .unwrap();
        fs::write(home.0.join(PROFILE_FILE), "{broken").unwrap();
        assert!(load_startup_profile(&home.0).is_err());
    }

    #[test]
    fn concurrent_saves_never_mix_identity_fields() {
        let home = TestHome::new();
        let threads: Vec<_> = (0..6)
            .map(|index| {
                let path = home.0.clone();
                std::thread::spawn(move || {
                    let marker = format!("成员-{index}");
                    for _ in 0..3 {
                        save_startup_profile(
                            &path,
                            &StartupProfile {
                                username: marker.clone(),
                                badge_id: marker.clone(),
                                visual_style: VisualStyle::Rhine,
                            },
                        )
                        .unwrap();
                        let saved = load_startup_profile(&path).unwrap();
                        assert_eq!(saved.username, saved.badge_id);
                    }
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
    }

    #[test]
    fn concurrent_partial_updates_preserve_each_selected_field() {
        let home = TestHome::new();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let workers: Vec<_> = (0..3).map(|field| {
            let path = home.0.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                update_startup_profile(&path, |profile| match field {
                    0 => profile.username = "Updated operator".into(),
                    1 => profile.badge_id = "DSH-UPDATED".into(),
                    _ => profile.visual_style = VisualStyle::Laterano,
                }).unwrap();
            })
        }).collect();
        for worker in workers { worker.join().unwrap(); }
        let saved = load_startup_profile(&home.0).unwrap();
        assert_eq!(saved.username, "Updated operator");
        assert_eq!(saved.badge_id, "DSH-UPDATED");
        assert_eq!(saved.visual_style, VisualStyle::Laterano);
        assert!(update_startup_profile(&home.0, |profile| profile.username.clear()).is_err());
        assert_eq!(load_startup_profile(&home.0).unwrap(), saved);
    }
}
