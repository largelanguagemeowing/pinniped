//! Pinniped's Windows installer. Shared between the stub that ships to users
//! (`pinniped-setup`) and the build-time packer (`pinniped-pack`).

pub mod args;
pub mod config;
pub mod payload;
