Flat Studio - HDB floor plan and 3D design tool

Run it
  Double-click index.html. Or serve the folder:  python3 -m http.server 8000  then open http://localhost:8000
  Three.js and the GLB/GLTF/OBJ loaders are bundled in lib/, so everything works offline.
  Only the web fonts need internet (system fonts are the fallback).
  If your browser blocks features on file:// pages, use the python command above.

What it does
  Draw: straight and angled walls (type a length such as 3.2 then Enter while dragging; per-wall thickness 60-400 mm in the inspector), rectangular and polygon rooms, auto-fill rooms inside closed walls,
        dimension lines, doors (single, double, sliding, archway), windows (standard, sliding, tall, high, bay).
  Edit: drag walls and corners, drag room corners, multi-select (Shift-click, Shift-drag box), copy and paste (Ctrl/Cmd+C, V),
        group, align, rotate, layers, furniture snaps flush to walls (hold Alt to switch off), undo and redo.
  Finishes: paint, tile, timber or concrete per wall; floors; skirting; ceiling colour.
  3D: orbit, walk through, sun and time of day, lamps that light up at night, 75 furniture, lighting, service and stair items with timber, fabric, leather, metal and gloss finishes.
  Render photo: button in the 3D bar. Accumulates many soft-shadow passes into a high-resolution PNG (not a path tracer).
  Import 3D models: GLB, GLTF (self-contained) or OBJ. Scaled to real size, stored in this browser (IndexedDB).
  Trace a paper plan: load a photo of the plan, set the scale from one dimension, draw over it.
  Export: plan PNG, plan SVG, PDF drawing pack (plan, elevations, schedule, budget, checks), DXF for CAD (millimetres, inside a ZIP),
        3D view PNG, elevations (PNG/SVG), JSON design file.
  Views: save camera views, jump into any room in walk mode. Sun: time of day and which way the plan faces (compass).
  Lighting plan (Checks tab): rough lux guide per room with one-click ceiling lights. Clearance checks: bed access, wardrobe front, tall items in front of windows.
  Budget: enter your own unit prices (or give any furniture item its own product name and price), add other costs, set a cap. Nothing is pre-filled.
  Versions: save named versions in the browser and restore them.
  Brochure layouts: Layout > From HDB brochures. Units redrawn from HDB sales brochures (layouts.js), structural walls marked,
       loaded as the original layout for the Checks tab. Close, not exact: check against your unit's plan.
  HDB: 3-room and 5-room generic layouts (not real HDB plans), mark structural walls, set the original layout,
       then the Checks tab compares walls and wet fixtures against it. Planning aid only, not an approval.

Not included
  True photorealistic path tracing (Render photo is a high-quality accumulated render, not a path tracer).
  Accounts, cloud save, sharing and comments. Those only work in the hosted version of the app. Here, use the JSON file or Files > Text to back up.
  CAD-style real HDB plan library, branded furniture catalogues, PDF plan import (export the page to an image first).

Edit it
  Everything is in index.html: CSS, markup, then one script. Furniture lives in the B and CAT tables, presets in hdbPreset(), checks in runChecks().
  Designs autosave in the browser. The traced image and imported models are stored in the browser only, not in the JSON.
