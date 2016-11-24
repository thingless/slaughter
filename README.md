Slaughter
---------
Making (debug) moves. "1" below is the team, 1 is Green, 2 is Red

## Adding a Peasant
Click a hex, then
```
sim.makeMove(new Move(1, hex, null, Tenant.Peasant));
```

## Moving a unit
Click the origin hex, then click the destination hex, then
```
sim.makeMove(new Move(1, hex, lastHex, null));
```

Simulator TODO:
Trees/Graves
Upkeep
Income
Death by too little money
Houses - splitting / joining territory, or destroying a house
Territory re-annotating after moves (splitting/connecting territory)
Events at beginning/end of game turn, player turn
