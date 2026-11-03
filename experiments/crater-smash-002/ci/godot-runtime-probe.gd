extends SceneTree
# Author-operated engine exercise, not an independent source-native observer.
# This script is copied into a disposable generated Godot project by CI.

func _initialize():
    call_deferred("_exercise")

func _abort(message: String):
    push_error("CRATER PROBE FAILED: " + message)
    quit(2)

func _exercise():
    var scene = load("res://main.tscn")
    if scene == null:
        _abort("main scene missing")
        return
    var subject = scene.instantiate()
    root.add_child(subject)
    await process_frame
    var initial_children = subject.get_child_count()
    var initial_stations: Array = subject.get("stations")
    if initial_stations.size() != 7:
        _abort("wrong number of stations")
        return
    if subject.get("struck") != false:
        _abort("impact should not start automatically")
        return
    var impact_event = InputEventKey.new()
    impact_event.pressed = true
    impact_event.keycode = KEY_I
    subject.call("_unhandled_key_input", impact_event)
    if subject.get("struck") != true:
        _abort("impact key did not transition world")
        return
    if subject.get_child_count() <= initial_children:
        _abort("no crater mesh was created")
        return
    var repair_event = InputEventKey.new()
    repair_event.pressed = true
    repair_event.keycode = KEY_E
    subject.call("_unhandled_key_input", repair_event)
    var healed: Dictionary = subject.get("healed")
    var first_station: String = str(initial_stations[0]["id"])
    if not healed.has(first_station):
        _abort("repair key did not alter nearby station")
        return
    var config: Dictionary = subject.get("config")
    var impact: Dictionary = config["impact"]
    print("WORLD_FORGE_CRATER_PROBE=" + JSON.stringify({
        "format":"world-forge/godot-in-engine-smoke/v0",
        "impact_signature":str(impact["signature"]),
        "stations":initial_stations.size(),
        "first_repaired_station":first_station,
        "struck":true,
        "new_crater_mesh":true,
        "receiver":"HOLD",
        "evidence_class":"AUTHOR_RUN_ENGINE_SMOKE",
        "source_native_witness":false,
        "minecraft_runtime_verified":false
    }))
    quit(0)
