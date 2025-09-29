
when trying to create a fixed position constraint, i can't type 0 in the boxes. 0 is a valid position. it also requires that i fill out all three values. just one is sufficient.

when creating or editing a constraint, there should be a cancel button. if the user hits esc inside the constrain popup, it should cancel but the selection should not be cleared.

selecting wps in the list and selecting them on the image should be the same thing - i should be able to select one from the image and one from the list if i wanted to and create a constraint

there is a Scale indicator in the footer and a scale slider in the bottom right. remove the slider panel and replace the indicator with the slider. don't increase the height of the footer

the image panel is too wide, there is a lot of dead space in it. the outer panel and the inner panels can be made 150 pixels narro
**


bugs:
when i select three points, all of a sudden a line appears between the last two. remove the lines. 


tasks:
Current: Image ViewTab to switch - remove text and make which tab is selected clearer

make the image sidebar resizable and store the size latest used. the images should be resized when the user resizes. it will help the user see where wps are on different images but allow the user to determine to what extent.

add a way to delete all selected items

restarting the server wipes my data, aren't we using local storage? or is it when the ports change? do i need to save/load?

add a midpoint constraint, makes a point appear on the middle of a line - or two lines share a center.

the world point list has gone crazy, hovering on a world point prints a lot of extra data so everything shifts around. remove this data. add a movable details window - see the FusionLineCreationTool. make sure to refactor the tool if needed so movable windows is a reusable component. the window should contain name editing and list the lines it is part of.

right side panel: remove "Properties Select points and choose a constraint type to set parameters" as i don't think it's used anymore? I want to be able to show and edit not only world points but also image points, lines, planes and circles. there is a constraints list there - it should also be moved into a separate popup. though world points take center stage since they can be added to the image and need to be accessible at the same level. the others can exist in dedicated popupts that show each entry with delete and edit options. each of those popups should contain a list with the most important content and the associated functions (edit/delete). all popups should inherit from the popup used in the FusionLineCreationTool. There are other tasks specifying that that a common core should be extracted as a reusable component. note that this task should be broken into multiple subtasks so they can bbe tested individually.

the top toolbar contains buttons for constraints that are no longer valid, distance, horizontal, vertical to be specific. these have been replaced with constraint properties on lines. the ui and all related classes can be removed.

***

add drag drop resorting of images in the images list - the sort order should be persisted with the project.

anywhere you find "Fusion" in a name, because it looks like a Fusion360 for for instance, replace that name. Don't reference fusion.

selecting no longer works. when the cursor is close to a wp, the wp should have selection prio. otherwise lines are ok. but clicking circles dont select them like it did before.
