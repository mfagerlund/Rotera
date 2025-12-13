Precision Mode

## Status: ACTIVE
**Last Updated:** 2025-12-13
**Applies to:** Current implementation of precision mode and loupe functionality

When initially placing more moving objects, we have a loupe to facilitate pixel perfect placement. We also have precision mode which is *toggled* by pressing shift during movement. Precision mode is disabled when entering the loupe, so it does NOT persist over several moves. When precision mode is engaged, we should record the current object position and the current mouse position. As the user moves the mouse under precision mode, the mouse delta will be scaled and added to the recorded object position. In effect, it makes the mouse move slower to allow for high precision placement.

The loupe should ALWAYS show exactly where the object will end up if dropped. There shouldn't be a pixels misalignment between the two. This holds true for BOTH precision mode and for regular mode.

Sometimes we record where the mouse is when we grab an object and compute mouse movements as offsets from the start position. We do this to prevent placed objects from being teleported to the mouse cursor at the start of every movement. If we select an object with mouse offset of (+5,-3) we maintain that offset. THIS MUST BE HONORED IN THE LOUPE DURING BOTH MODES.