extends Node3D
# An author-run engine probe, NOT an independent game-world observation.
const SOURCE = "a8a7862f462a6927e1983cf299f930368a5745751695e8f4755a2c476f560966"
var block: MeshInstance3D
var states = ["BREACHED"]
var actions = []

func _ready():
    block = MeshInstance3D.new()
    var mesh = BoxMesh.new()
    mesh.size = Vector3(2, 1, 2)
    block.mesh = mesh
    add_child(block)
    actions.append("SALVAGE")
    actions.append("REPAIR")
    block.position.y = 2.0
    states.append("RESTORED")
    states.append("RESTORED")
    var receipt = {
        "format": "world-forge/engine-probe/v0",
        "source_sha256": SOURCE,
        "engine": "godot-4",
        "instance": "alpha",
        "station": "garden",
        "states": states,
        "actions": actions,
        "evidence_class": "ENGINE_SELF_REPORT",
        "signature": null,
        "observer": null,
        "receiver": "HOLD"
    }
    print("WORLD_FORGE_ENGINE_PROBE=" + JSON.stringify(receipt))
