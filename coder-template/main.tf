terraform {
  required_providers {
    coder = {
      source  = "coder/coder"
      version = ">= 2.0.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.6"
    }
  }
}

provider "coder" {}
provider "docker" {}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}
data "coder_provisioner" "me" {}

locals {
  username = "coder"
}

resource "coder_agent" "main" {
  arch = data.coder_provisioner.me.arch
  os   = "linux"
  dir  = "/home/${local.username}"

  display_apps {
    vscode       = true
    web_terminal = true
    ssh_helper   = true
  }
}

module "code-server" {
  count    = data.coder_workspace.me.start_count
  source   = "registry.coder.com/coder/code-server/coder"
  version  = "~> 1.0"
  agent_id = coder_agent.main.id
  folder   = "/home/${local.username}"
}

resource "docker_image" "workspace" {
  name         = "codercom/enterprise-base:ubuntu"
  keep_locally = true
}

resource "docker_volume" "home" {
  name = "pad-local-${data.coder_workspace.me.id}-home"

  labels {
    label = "pad.local"
    value = "true"
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }

  lifecycle {
    ignore_changes = all
  }
}

resource "docker_container" "workspace" {
  count    = data.coder_workspace.me.start_count
  image    = docker_image.workspace.image_id
  name     = "pad-local-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}"
  hostname = data.coder_workspace.me.name
  entrypoint = [
    "sh",
    "-c",
    replace(coder_agent.main.init_script, "/localhost|127\\.0\\.0\\.1/", "host.docker.internal")
  ]
  env = ["CODER_AGENT_TOKEN=${coder_agent.main.token}"]

  host {
    host = "host.docker.internal"
    ip   = "host-gateway"
  }

  volumes {
    container_path = "/home/${local.username}"
    volume_name    = docker_volume.home.name
    read_only      = false
  }

  labels {
    label = "pad.local"
    value = "true"
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }
  labels {
    label = "coder.workspace_name"
    value = data.coder_workspace.me.name
  }
}

resource "coder_metadata" "workspace" {
  count       = data.coder_workspace.me.start_count
  resource_id = docker_container.workspace[0].id

  item {
    key   = "image"
    value = docker_image.workspace.name
  }
  item {
    key   = "home volume"
    value = docker_volume.home.name
  }
}
