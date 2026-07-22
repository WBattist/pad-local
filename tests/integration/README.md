# Windows Docker Desktop integration checklist

These tests require a real Windows 10/11 host with Docker Desktop's Linux engine. Hosted Windows
GitHub runners do not provide a supported nested Docker Desktop session, so CI runs unit/static
tests and this checklist is run on a dedicated Windows test host.

1. Remove the test installation and explicitly purge only the `pad-local` test volumes.
2. Run the raw GitHub `irm ... | iex` command with Git temporarily absent from `PATH`.
3. Repeat installation and confirm the generated secrets and existing volume IDs do not change.
4. Repeat with Docker Desktop stopped; confirm the installer launches it and waits.
5. Run `pad`, authenticate with `pad credentials`, create/edit a canvas, open terminal and
   code-server, then press Ctrl+C. Confirm Compose containers stop and no volume is deleted.
6. Run `pad` again and confirm the account, canvas, workspace, and `/home/coder` files persist.
7. Run `pad start`, close the terminal, verify the stack remains running, and then `pad stop`.
8. Kill an attached PowerShell process and confirm `session-watch.ps1` stops the owned Compose
   stack. Re-run `pad` to confirm stale-lock recovery.
9. Occupy ports 8000/7080/8080 in turn and confirm Pad identifies the owner without killing it.
10. Interrupt Coder template bootstrap and Keycloak's first start; rerun and confirm recovery.
11. Run `pad update`; verify configuration, volumes, canvas, and workspace data survive.
12. Verify `pad reset` cancels unless `DELETE` is typed and `pad reset --yes` purges labeled data.
13. Verify `pad uninstall` preserves volumes and `pad uninstall --purge` deletes labeled data.

Record Docker Desktop version, Windows build, CPU architecture, and each command's transcript in
the release test report.
