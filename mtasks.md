
when trying to create a fixed position constraint, i can't type 0 in the boxes. 0 is a valid position. it also requires that i fill out all three values. just one is sufficient.

when creating or editing a constraint, there should be a cancel button. if the user hits esc inside the constrain popup, it should cancel but the selection should not be cleared.

**


bugs:



tasks:

add a way to delete all selected items

restarting the server wipes my data, aren't we using local storage? or is it when the ports change? do i need to save/load?

add a midpoint constraint, makes a point appear on the middle of a line - or two lines share a center.

editing wps, the x y z should be on one row called position. the values are known world positions, so they should default to null. or unknown. users can set them in any combination. currently they seem defaultet to 0. this value will be used as a constraint later on. i'm not sure where it's stored on the wp, but if it's NOT stored on the wp yet we need to add it and make it work from entity->dto->optimizer.

I *think* there's a 3d module in "C:\Dev\Xflatter" - we had difficult issues finding a combo of components that worked. we need a 3d viewer to show cameras and points/constraints in 3d. this could be a good help.

***

