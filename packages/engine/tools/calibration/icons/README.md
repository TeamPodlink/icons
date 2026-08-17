Archived icon.json specs of the calibration instruments (bundles deleted
2026-07-08; the rendered 1024 targets live on in comparison/). To
reconstitute an instrument:

  mkdir -p <name>.icon/Assets
  cp tools/calibration/icons/<name>.json <name>.icon/icon.json
  cp Podcasts-decant.icon/Assets/{1_person,2_circle2,3_circle1}.svg <name>.icon/Assets/
  # checkerboard variants additionally need their pattern SVG:
  cp tools/calibration/icons/<name>-checkerboard*.svg <name>.icon/Assets/<pattern-name>.svg

(Each icon references only the assets its layers name; extra copies are
harmless. The diskcal-* shadow/two-gray instruments are generated
programmatically by measure_disk_luts.py and need no specs here.)
