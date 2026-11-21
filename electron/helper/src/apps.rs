//! The applications a screen share's audio can be limited to, as both platforms name them: what
//! `screenshare_apps` lists and what `screenshare_link`'s `only` picks. The platforms find the
//! audio (sessions grouped into process trees on Windows, streams on Linux); this decides which
//! application it belongs to and whether a share carries it.

use std::cmp::Ordering;
use std::collections::hash_map::{Entry, HashMap};

use serde::Serialize;

#[cfg(test)]
mod tests;

/// An application that plays audio, as `screenshare_apps` lists it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct App {
    /// What `only` names it by; compared without case.
    pub id: String,
    /// What Pinniped shows for it.
    pub name: String,
}

impl App {
    /// A process tree on Windows, by the executable file name of its root (`Spotify.exe`): that
    /// is the id, the same name the exclusion list compares against, and the name is it without
    /// the extension.
    #[cfg(any(windows, test))]
    pub fn from_exe(file_name: &str) -> Option<App> {
        let id = file_name.trim();
        if id.is_empty() {
            return None;
        }
        let name = match id.rsplit_once('.') {
            Some((stem, _)) if !stem.is_empty() => stem,
            _ => id,
        };
        Some(App {
            id: id.to_owned(),
            name: name.to_owned(),
        })
    }

    /// A PipeWire stream on Linux, by its `application.process.binary` and `application.name`
    /// properties: the binary is the id and the name the name, each standing in for the other
    /// when missing. A stream with neither belongs to no application.
    #[cfg(any(target_os = "linux", test))]
    pub fn from_stream(binary: Option<&str>, name: Option<&str>) -> Option<App> {
        fn present(v: Option<&str>) -> Option<&str> {
            v.map(str::trim).filter(|v| !v.is_empty())
        }
        let (binary, name) = (present(binary), present(name));
        let id = binary.or(name)?;
        Some(App {
            id: id.to_owned(),
            name: name.unwrap_or(id).to_owned(),
        })
    }
}

/// Which applications a share carries; never Pinniped itself, whatever this says.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AppFilter {
    /// Every application that plays on the output device.
    All,
    /// Only the application with this id.
    Only(String),
}

impl AppFilter {
    /// From `screenshare_link`'s `only`: absent shares every application. A blank id would match
    /// nothing and share silence, so it is refused.
    pub fn new(only: Option<String>) -> Result<Self, String> {
        match only {
            None => Ok(Self::All),
            Some(id) if id.trim().is_empty() => Err("`only` names no application".into()),
            Some(id) => Ok(Self::Only(id)),
        }
    }

    /// Whether the audio of application `id` is shared. Audio that belongs to no application
    /// (`None`) is shared only along with everything else.
    pub fn admits(&self, id: Option<&str>) -> bool {
        match self {
            Self::All => true,
            Self::Only(only) => id.is_some_and(|id| id_key(id) == id_key(only)),
        }
    }
}

impl std::fmt::Display for AppFilter {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Self::All => f.write_str("every application"),
            Self::Only(id) => write!(f, "only {id:?}"),
        }
    }
}

/// What `screenshare_apps` answers with: each application once (by id, without case), sorted by
/// name without case. When one id comes with several names (streams of one program can differ),
/// the first by that order is kept, so the answer does not depend on discovery order.
pub fn app_list(apps: impl IntoIterator<Item = App>) -> Vec<App> {
    let mut by_id: HashMap<String, App> = HashMap::new();
    for app in apps {
        match by_id.entry(id_key(&app.id)) {
            Entry::Vacant(entry) => {
                entry.insert(app);
            }
            Entry::Occupied(mut entry) => {
                if list_order(&app, entry.get()).is_lt() {
                    entry.insert(app);
                }
            }
        }
    }
    let mut list: Vec<App> = by_id.into_values().collect();
    list.sort_by(list_order);
    list
}

/// Name without case, then id without case, then exact spelling, so the order is total.
fn list_order(a: &App, b: &App) -> Ordering {
    a.name
        .to_lowercase()
        .cmp(&b.name.to_lowercase())
        .then_with(|| id_key(&a.id).cmp(&id_key(&b.id)))
        .then_with(|| a.name.cmp(&b.name))
        .then_with(|| a.id.cmp(&b.id))
}

fn id_key(id: &str) -> String {
    id.to_lowercase()
}

/// Whether the program `name` (an executable file name) is on the exclusion list. File names
/// compare without case, and an entry may leave out `.exe`.
#[cfg(any(windows, test))]
pub fn is_excluded(name: &str, exclude: &[String]) -> bool {
    let name = name.to_lowercase();
    let bare = name.strip_suffix(".exe").unwrap_or(&name);
    exclude.iter().any(|entry| {
        let entry = entry.trim().to_lowercase();
        let entry = entry.strip_suffix(".exe").unwrap_or(&entry);
        !entry.is_empty() && entry == bare
    })
}
