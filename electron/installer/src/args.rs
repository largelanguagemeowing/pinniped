//! The command line. `electron-updater` runs the downloaded installer as
//! `<exe> --updated [/S] [--force-run] [/D=<dir>] [--package-file=<file>]`, so those keep
//! their NSIS meaning. The rest is ours.

use std::path::PathBuf;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Args {
    /// `/S`: no window, no prompts.
    pub silent: bool,
    /// `--updated`: started by the updater (informational).
    pub updated: bool,
    /// `--force-run`: start the app afterwards even when silent.
    pub force_run: bool,
    /// `/D=<dir>`: install here instead of the previous or default location.
    pub install_dir: Option<PathBuf>,
    /// `--uninstall`: remove the app instead of installing (the uninstaller has no payload,
    /// so this is also its default).
    pub uninstall: bool,
    /// Internal: the temporary copy of the uninstaller removes this directory.
    pub cleanup: Option<PathBuf>,
}

pub fn parse<I: IntoIterator<Item = String>>(args: I) -> Args {
    let mut out = Args::default();
    let mut it = args.into_iter();
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "/S" | "/s" | "--silent" | "/silent" => out.silent = true,
            "--updated" => out.updated = true,
            "--force-run" => out.force_run = true,
            "--uninstall" | "/uninstall" => out.uninstall = true,
            "--cleanup" => out.cleanup = it.next().map(PathBuf::from),
            // Flags NSIS installers accepted that mean nothing for a per-user install.
            "/currentuser" | "/allusers" => {}
            _ => {
                if let Some(dir) = arg.strip_prefix("/D=").or_else(|| arg.strip_prefix("/d=")) {
                    out.install_dir = Some(PathBuf::from(dir.trim_matches('"')));
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(args: &[&str]) -> Args {
        parse(args.iter().map(|s| s.to_string()))
    }

    #[test]
    fn updater_command_line() {
        let a = p(&["--updated", "/S", "--force-run", r"/D=C:\Users\a b\AppData\Local\Programs\Pinniped"]);
        assert!(a.silent && a.updated && a.force_run);
        assert_eq!(a.install_dir, Some(PathBuf::from(r"C:\Users\a b\AppData\Local\Programs\Pinniped")));
    }

    #[test]
    fn plain_run_is_interactive() {
        assert_eq!(p(&[]), Args::default());
    }

    #[test]
    fn uninstaller_flags() {
        let a = p(&["/currentuser", "/S"]);
        assert!(a.silent && !a.uninstall);
        let a = p(&["--cleanup", r"C:\x"]);
        assert_eq!(a.cleanup, Some(PathBuf::from(r"C:\x")));
    }

    #[test]
    fn ignores_unknown() {
        assert_eq!(p(&["--package-file=C:\\x.7z"]), Args::default());
    }
}
