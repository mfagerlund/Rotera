# Detailed Initialization Algorithms - Part 1

## World Point Initialization - Unified 6-Step Pipeline

### Step 1: Locked Points

Set optimizedXyz for all world points that have all three coordinates locked by user.

```typescript
INPUT:  worldPoints with isFullyLocked() == true
OUTPUT: point.optimizedXyz set for all locked points

for each point in worldPoints:
  if point.isFullyLocked():
    point.optimizedXyz = [
      point.lockedXyz[0]!, 
      point.lockedXyz[1]!, 
      point.lockedXyz[2]!
    ]
    initialized.add(point)

LOG: [Step 1] Set N locked points
```

### Step 2: Infer from Constraints

Propagate positions through chains of lines with direction and length constraints.

```typescript
INPUT:  lines with targetLength and direction constraint
OUTPUT: points inferred from line constraints

for iteration in 1..10:
  madeProgress = false
  
  for each line in lines:
    if line.targetLength == undefined OR line.direction == 'free':
      continue
    
    if (line.pointA in initialized) AND (line.pointB NOT in initialized):
      inferred = inferPointPosition(
        line.pointA, line.pointB, 
        line.targetLength, line.direction, sceneScale
      )
      if inferred:
        line.pointB.optimizedXyz = inferred
        initialized.add(line.pointB)
        madeProgress = true
    
    if (line.pointB in initialized) AND (line.pointA NOT in initialized):
      similar for pointA
  
  if NOT madeProgress:
    break

DIRECTION OFFSET CALCULATIONS:
  "x-aligned":  position = [x0 + length, y0, z0]
  "vertical":   position = [x0, y0 + length, z0]
  "z-aligned":  position = [x0, y0, z0 + length]
  "horizontal": position = [x0 + length*0.707, y0, z0 + length*0.707]

LOG: [Step 2] Inferred N points from constraints
```

### Step 3: Triangulate from Images

Use ray-ray triangulation to find world point positions from image observations.

```typescript
INPUT:  worldPoints with 2+ image observations in different cameras
OUTPUT: point.optimizedXyz set via triangulation

for each point in worldPoints:
  if point in initialized:
    continue
  
  imagePoints = point.imagePoints (array)
  if imagePoints.length < 2:
    failed += 1
    continue
  
  triangulated = false
  
  for i in 0..imagePoints.length-1:
    for j in i+1..imagePoints.length-1:
      ip1 = imagePoints[i]
      ip2 = imagePoints[j]
      
      if ip1.viewpoint == ip2.viewpoint:
        continue
      
      vp1 = ip1.viewpoint
      vp2 = ip2.viewpoint
      
      hasPosition1 = vp1.position != [0,0,0]
      hasPosition2 = vp2.position != [0,0,0]
      
      if NOT (hasPosition1 AND hasPosition2):
        continue
      
      result = triangulateRayRay(ip1, ip2, vp1, vp2, fallbackDepth=10)
      
      if result:
        point.optimizedXyz = result.worldPoint
        initialized.add(point)
        triangulated = true
        triangulated_count += 1
        break
    
    if triangulated:
      break

LOG: [Step 3] Triangulated N new points
```

### Step 4: Propagate Through Line Graph

BFS traversal through line connectivity to initialize remaining points.

```typescript
INPUT:  any initialized points from steps 1-3
OUTPUT: additional points initialized via line graph

startSize = initialized.size

if initialized.empty() AND points.length > 0:
  points[0].optimizedXyz = [0, 0, 0]
  initialized.add(points[0])

queue = Array.from(initialized)

while queue.length > 0:
  currentPoint = queue.shift()
  
  if NOT currentPoint.optimizedXyz:
    continue
  
  for each line in lines:
    otherPoint = null
    
    if (line.pointA == currentPoint) AND (line.pointB NOT in initialized):
      otherPoint = line.pointB
    else if (line.pointB == currentPoint) AND (line.pointA NOT in initialized):
      otherPoint = line.pointA
    
    if otherPoint:
      direction = randomUnitVector()
      distance = line.targetLength ?? (sceneScale * 0.2)
      
      current = currentPoint.optimizedXyz
      otherPoint.optimizedXyz = [
        current[0] + direction[0] * distance,
        current[1] + direction[1] * distance,
        current[2] + direction[2] * distance
      ]
      
      initialized.add(otherPoint)
      queue.push(otherPoint)

LOG: [Step 4] Propagated N points through line graph
```

### Step 5: Coplanar Groups

Place points in coplanar groups on parallel planes arranged in grids.

```typescript
INPUT:  CoplanarPointsConstraint groups with 4+ points
OUTPUT: points in groups placed on parallel planes

groups = []
for constraint in constraints:
  if constraint.type == 'coplanar_points' AND constraint.points.length >= 4:
    groups.push(constraint.points)

coplanarCount = 0

for (planeIdx, group) in enumerate(groups):
  planeZ = (planeIdx - groups.length/2) * sceneScale * 0.3
  
  gridSize = ceil(sqrt(group.length))
  spacing = sceneScale / gridSize
  
  for (idx, point) in enumerate(group):
    if point in initialized:
      continue
    
    row = floor(idx / gridSize)
    col = idx % gridSize
    
    x = (col - gridSize/2) * spacing
    y = (row - gridSize/2) * spacing
    
    point.optimizedXyz = [x, y, planeZ]
    initialized.add(point)
    coplanarCount += 1

LOG: [Step 5] Initialized N points in M coplanar groups
```

### Step 6: Random Fallback

Initialize any remaining points with uniform random positions.

```typescript
INPUT:  any remaining uninitialized points
OUTPUT: all points have optimizedXyz set

randomCount = 0

for point in points:
  if point NOT in initialized:
    point.optimizedXyz = [
      (random() - 0.5) * sceneScale,
      (random() - 0.5) * sceneScale,
      (random() - 0.5) * sceneScale
    ]
    initialized.add(point)
    randomCount += 1

LOG: [Step 6] Random fallback for N points
LOG: [Unified Initialization] Complete: M/M points initialized
```

