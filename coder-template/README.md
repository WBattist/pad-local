# Pad Local Coder template

This template provisions a persistent Linux development workspace through Docker Desktop. The
container is ephemeral, while `/home/coder` is stored in a labeled Docker volume that survives
normal Pad shutdowns and workspace restarts. It exposes Coder's web terminal, VS Code Desktop,
SSH helper, and a browser-based code-server application.

The provisioner reaches Docker through Pad Local's socket proxy. Anyone who can modify templates
or issue unrestricted Docker API calls may effectively control the Docker Desktop Linux VM; see
the repository security notes before granting additional local users administrative access.
