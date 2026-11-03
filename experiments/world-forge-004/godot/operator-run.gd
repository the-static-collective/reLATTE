extends SceneTree
# This process authors only 3 bounded changes to a real Godot BoxMesh scene.
# It writes PURE PACKED SCENES, not a witness claim. Observer runs independently.

func _initialize() -> void:
    call_deferred("_run")

func _fail(message: String) -> void:
    push_error("WF004 AUTHOR: " + message)
    quit(2)

func _run() -> void:
    var world: String = OS.get_environment("WF_WORLD")
    if world != "alpha" and world != "beta":
        _fail("unknown world")
        return
    var root_world := Node3D.new()
    root_world.name = "World"
    root.add_child(root_world)
    var block := MeshInstance3D.new()
    block.name = "ObservedPad"
    var cube := BoxMesh.new()
    cube.size = Vector3(2.0, 1.0, 2.0)
    block.mesh = cube
    root_world.add_child(block)
    block.owner = root_world
    var base_color := Color(0.20, 0.46, 0.18, 1.0) if world == "alpha" else Color(0.67, 0.42, 0.21, 1.0)
    var dark_color := Color(0.10, 0.09, 0.11, 1.0)
    for stage in ["build", "impact", "repair"]:
        var material := StandardMaterial3D.new()
        material.albedo_color = dark_color if stage == "impact" else base_color
        block.material_override = material
        await process_frame
        var packed := PackedScene.new()
        if packed.pack(root_world) != OK:
            _fail("could not pack scene " + stage)
            return
        var path: String = "res://snapshots/" + world + "-" + stage + ".tscn"
        if ResourceSaver.save(packed, path) != OK:
            _fail("could not save " + path)
            return
        print("WF004_GODOT_AUTHOR_STAGE=" + world + ":" + stage)
    quit(0)
