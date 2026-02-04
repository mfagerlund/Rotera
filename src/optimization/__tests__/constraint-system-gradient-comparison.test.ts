/**
 * Tests that ConstraintSystem's analytical providers match autodiff.
 * Uses the actual buildAnalyticalProviders function.
 */

import { Value } from 'scalar-autograd';
import { ConstraintSystem } from '../constraint-system/ConstraintSystem';
import { WorldPoint } from '../../entities/world-point/WorldPoint';
import { Viewpoint } from '../../entities/viewpoint/Viewpoint';
import { ImagePoint } from '../../entities/imagePoint/ImagePoint';
import { accumulateNormalEquations } from '../analytical/accumulate-normal-equations';

describe('ConstraintSystem gradient comparison', () => {
  it('compares analytical vs autodiff for rotated camera', () => {
    // Setup: 1 point, 1 camera with non-trivial rotation
    const angle = Math.PI / 4;
    const halfAngle = angle / 2;
    const qw = Math.cos(halfAngle);
    const qy = Math.sin(halfAngle);

    const point = WorldPoint.create('P', {
      lockedXyz: [null, null, null],
      optimizedXyz: [1, 2, 5],
    });

    const camera = Viewpoint.create('Cam', 'cam.jpg', '/images/cam.jpg', 640, 480, {
      focalLength: 500,
      position: [0.5, 0.5, 0],
      rotation: [qw, 0, qy, 0],
    });

    const imagePoint = ImagePoint.create(point, camera, 450, 320);

    // Build system
    const system = new ConstraintSystem();
    system.addPoint(point);
    system.addCamera(camera);
    system.addImagePoint(imagePoint);

    // Get analytical providers using actual buildAnalyticalProviders
    const { providers, layout } = system.buildAnalyticalProviders();

    console.log('Variable layout:');
    console.log('  numVariables:', layout.numVariables);
    console.log('  Point P indices:', layout.getWorldPointIndices(point));
    console.log('  Camera Cam pos indices:', layout.getCameraPosIndices('Cam'));
    console.log('  Camera Cam quat indices:', layout.getCameraQuatIndices('Cam'));
    console.log('  Provider count:', providers.length);

    // Get initial variable values
    const vars = layout.initialValues;
    console.log('Initial values:', Array.from(vars));

    // Compute analytical normal equations
    const analyticalNE = accumulateNormalEquations(vars, providers, layout.numVariables);
    console.log('Analytical cost:', analyticalNE.cost);
    console.log('Analytical residuals:', Array.from(analyticalNE.residuals));
    console.log('Analytical negJtr:', Array.from(analyticalNE.negJtr).map((v) => v.toFixed(4)));

    // Now compute autodiff normal equations
    // Build autodiff variables in the same order
    const autoVars: Value[] = [];
    for (let i = 0; i < layout.numVariables; i++) {
      autoVars.push(new Value(vars[i], `v${i}`, true));
    }

    // Build autodiff residual function matching what ConstraintSystem does
    const residualFn = (variables: Value[]) => {
      const residuals: Value[] = [];

      // Get point coordinates
      const pIndices = layout.getWorldPointIndices(point);
      const px =
        pIndices[0] >= 0
          ? variables[pIndices[0]]
          : new Value(layout.getLockedWorldPointValue(point, 'x')!);
      const py =
        pIndices[1] >= 0
          ? variables[pIndices[1]]
          : new Value(layout.getLockedWorldPointValue(point, 'y')!);
      const pz =
        pIndices[2] >= 0
          ? variables[pIndices[2]]
          : new Value(layout.getLockedWorldPointValue(point, 'z')!);

      // Get camera pose
      const posIndices = layout.getCameraPosIndices('Cam');
      const cpx =
        posIndices[0] >= 0
          ? variables[posIndices[0]]
          : new Value(layout.getLockedCameraPosValue('Cam', 'x')!);
      const cpy =
        posIndices[1] >= 0
          ? variables[posIndices[1]]
          : new Value(layout.getLockedCameraPosValue('Cam', 'y')!);
      const cpz =
        posIndices[2] >= 0
          ? variables[posIndices[2]]
          : new Value(layout.getLockedCameraPosValue('Cam', 'z')!);

      const quatIndices = layout.getCameraQuatIndices('Cam');
      const qwV = quatIndices[0] >= 0 ? variables[quatIndices[0]] : new Value(camera.rotation[0]);
      const qxV = quatIndices[1] >= 0 ? variables[quatIndices[1]] : new Value(camera.rotation[1]);
      const qyV = quatIndices[2] >= 0 ? variables[quatIndices[2]] : new Value(camera.rotation[2]);
      const qzV = quatIndices[3] >= 0 ? variables[quatIndices[3]] : new Value(camera.rotation[3]);

      // Quaternion normalization residual (if camera is optimized)
      if (quatIndices[0] >= 0) {
        const quatNorm = qwV.mul(qwV).add(qxV.mul(qxV)).add(qyV.mul(qyV)).add(qzV.mul(qzV));
        residuals.push(quatNorm.sub(1));
      }

      // Transform world point to camera frame
      const tx = px.sub(cpx);
      const ty = py.sub(cpy);
      const tz = pz.sub(cpz);

      // Quaternion rotation using Hamilton product: q * v * q*
      // Formula: v' = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
      const dot = qxV.mul(tx).add(qyV.mul(ty)).add(qzV.mul(tz));
      const qVecSq = qxV.mul(qxV).add(qyV.mul(qyV)).add(qzV.mul(qzV));
      const wSqMinusQVecSq = qwV.mul(qwV).sub(qVecSq);
      const crossX = qyV.mul(tz).sub(qzV.mul(ty));
      const crossY = qzV.mul(tx).sub(qxV.mul(tz));
      const crossZ = qxV.mul(ty).sub(qyV.mul(tx));

      const camX = dot.mul(2).mul(qxV).add(wSqMinusQVecSq.mul(tx)).add(qwV.mul(crossX).mul(2));
      const camY = dot.mul(2).mul(qyV).add(wSqMinusQVecSq.mul(ty)).add(qwV.mul(crossY).mul(2));
      const camZ = dot.mul(2).mul(qzV).add(wSqMinusQVecSq.mul(tz)).add(qwV.mul(crossZ).mul(2));

      // Project (convention: V = cy - fy * yNorm)
      const fx = camera.focalLength;
      const fy = camera.focalLength * camera.aspectRatio;
      const cx_intr = camera.principalPointX;
      const cy_intr = camera.principalPointY;

      const invZ = camZ.pow(-1);
      const normX = camX.mul(invZ);
      const normY = camY.mul(invZ);

      const u = normX.mul(fx).add(cx_intr);
      const v = new Value(cy_intr).sub(normY.mul(fy));

      // Reprojection residuals
      residuals.push(u.sub(imagePoint.u));
      residuals.push(v.sub(imagePoint.v));

      return residuals;
    };

    // Compute autodiff residuals and jacobian
    const autodiffResiduals = residualFn(autoVars);
    const numResiduals = autodiffResiduals.length;
    const numVariables = autoVars.length;

    // Build jacobian
    const jacobian: number[][] = [];
    const residualValues: number[] = [];

    for (let i = 0; i < numResiduals; i++) {
      residualValues.push(autodiffResiduals[i].data);

      Value.zeroGradTree(autodiffResiduals[i]);
      for (const v of autoVars) v.grad = 0;
      autodiffResiduals[i].backward();

      jacobian.push(autoVars.map((v) => v.grad));
    }

    console.log('Autodiff residuals:', residualValues);

    // Compute autodiff J^T J
    const autodiffJtJ: number[][] = Array.from({ length: numVariables }, () =>
      new Array(numVariables).fill(0)
    );
    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        let sum = 0;
        for (let k = 0; k < numResiduals; k++) {
          sum += jacobian[k][i] * jacobian[k][j];
        }
        autodiffJtJ[i][j] = sum;
      }
    }

    // Compute autodiff -J^T r
    const autodiffNegJtr: number[] = new Array(numVariables).fill(0);
    for (let j = 0; j < numVariables; j++) {
      let sum = 0;
      for (let k = 0; k < numResiduals; k++) {
        sum += jacobian[k][j] * residualValues[k];
      }
      autodiffNegJtr[j] = -sum;
    }

    // Compute autodiff cost
    const autodiffCost = residualValues.reduce((sum, r) => sum + r * r, 0);
    console.log('Autodiff cost:', autodiffCost);
    console.log('Autodiff negJtr:', autodiffNegJtr.map((v) => v.toFixed(4)));

    // Compare costs
    expect(Math.abs(analyticalNE.cost - autodiffCost)).toBeLessThan(1e-6);

    // Compare J^T J diagonal
    console.log('\nJ^T J comparison (diagonal only):');
    for (let i = 0; i < numVariables; i++) {
      const analytical = analyticalNE.JtJ.get(i, i);
      const autodiff = autodiffJtJ[i][i];
      const diff = Math.abs(analytical - autodiff);
      const relDiff = diff / Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
      console.log(
        `  [${i},${i}]: analytical=${analytical.toFixed(4)}, autodiff=${autodiff.toFixed(4)}, diff=${diff.toFixed(4)}, rel=${(relDiff * 100).toFixed(2)}%`
      );
    }

    // Compare -J^T r
    console.log('\n-J^T r comparison:');
    for (let i = 0; i < numVariables; i++) {
      const analytical = analyticalNE.negJtr[i];
      const autodiff = autodiffNegJtr[i];
      const diff = Math.abs(analytical - autodiff);
      console.log(
        `  [${i}]: analytical=${analytical.toFixed(4)}, autodiff=${autodiff.toFixed(4)}, diff=${diff.toFixed(4)}`
      );
    }

    // Assert J^T J matches
    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        const analytical = analyticalNE.JtJ.get(i, j);
        const autodiff = autodiffJtJ[i][j];
        expect(analytical).toBeCloseTo(autodiff, 3);
      }
    }

    // Assert -J^T r matches
    for (let i = 0; i < numVariables; i++) {
      expect(analyticalNE.negJtr[i]).toBeCloseTo(autodiffNegJtr[i], 3);
    }
  });

  it('compares analytical vs autodiff after perturbation', () => {
    // Setup: 1 point, 1 camera with non-trivial rotation
    const angle = Math.PI / 4;
    const halfAngle = angle / 2;
    const qw = Math.cos(halfAngle);
    const qy = Math.sin(halfAngle);

    const point = WorldPoint.create('P', {
      lockedXyz: [null, null, null],
      optimizedXyz: [1, 2, 5],
    });

    const camera = Viewpoint.create('Cam', 'cam.jpg', '/images/cam.jpg', 640, 480, {
      focalLength: 500,
      position: [0.5, 0.5, 0],
      rotation: [qw, 0, qy, 0],
    });

    const imagePoint = ImagePoint.create(point, camera, 450, 320);

    // Build system
    const system = new ConstraintSystem();
    system.addPoint(point);
    system.addCamera(camera);
    system.addImagePoint(imagePoint);

    // Get analytical providers using actual buildAnalyticalProviders
    const { providers, layout } = system.buildAnalyticalProviders();

    console.log('Provider count:', providers.length);
    console.log('Provider variable indices:');
    for (let p = 0; p < providers.length; p++) {
      console.log(`  Provider ${p}: variableIndices =`, providers[p].variableIndices);
    }

    // Get initial variable values and PERTURB them
    const vars = new Float64Array(layout.initialValues);
    console.log('Initial values:', Array.from(vars));

    // Apply perturbation like LM would
    for (let i = 0; i < vars.length; i++) {
      vars[i] += 0.1 * (i + 1);  // Small perturbation
    }
    console.log('Perturbed values:', Array.from(vars));

    // Compute analytical normal equations at perturbed values
    const analyticalNE = accumulateNormalEquations(vars, providers, layout.numVariables);
    console.log('Analytical cost:', analyticalNE.cost);

    // Now compute autodiff normal equations at the same perturbed values
    const autoVars: Value[] = [];
    for (let i = 0; i < layout.numVariables; i++) {
      autoVars.push(new Value(vars[i], `v${i}`, true));
    }

    // Build autodiff residual function
    const residualFn = (variables: Value[]) => {
      const residuals: Value[] = [];

      // Get point coordinates
      const pIndices = layout.getWorldPointIndices(point);
      const px =
        pIndices[0] >= 0
          ? variables[pIndices[0]]
          : new Value(layout.getLockedWorldPointValue(point, 'x')!);
      const py =
        pIndices[1] >= 0
          ? variables[pIndices[1]]
          : new Value(layout.getLockedWorldPointValue(point, 'y')!);
      const pz =
        pIndices[2] >= 0
          ? variables[pIndices[2]]
          : new Value(layout.getLockedWorldPointValue(point, 'z')!);

      // Get camera pose
      const posIndices = layout.getCameraPosIndices('Cam');
      const cpx =
        posIndices[0] >= 0
          ? variables[posIndices[0]]
          : new Value(layout.getLockedCameraPosValue('Cam', 'x')!);
      const cpy =
        posIndices[1] >= 0
          ? variables[posIndices[1]]
          : new Value(layout.getLockedCameraPosValue('Cam', 'y')!);
      const cpz =
        posIndices[2] >= 0
          ? variables[posIndices[2]]
          : new Value(layout.getLockedCameraPosValue('Cam', 'z')!);

      const quatIndices = layout.getCameraQuatIndices('Cam');
      const qwV = quatIndices[0] >= 0 ? variables[quatIndices[0]] : new Value(camera.rotation[0]);
      const qxV = quatIndices[1] >= 0 ? variables[quatIndices[1]] : new Value(camera.rotation[1]);
      const qyV = quatIndices[2] >= 0 ? variables[quatIndices[2]] : new Value(camera.rotation[2]);
      const qzV = quatIndices[3] >= 0 ? variables[quatIndices[3]] : new Value(camera.rotation[3]);

      // Quaternion normalization residual (if camera is optimized)
      if (quatIndices[0] >= 0) {
        const quatNorm = qwV.mul(qwV).add(qxV.mul(qxV)).add(qyV.mul(qyV)).add(qzV.mul(qzV));
        residuals.push(quatNorm.sub(1));
      }

      // Transform world point to camera frame
      const tx = px.sub(cpx);
      const ty = py.sub(cpy);
      const tz = pz.sub(cpz);

      // Quaternion rotation using Hamilton product: q * v * q*
      // Formula: v' = 2*(q_vec · t)*q_vec + (w² - |q_vec|²)*t + 2*w*(q_vec × t)
      const dot = qxV.mul(tx).add(qyV.mul(ty)).add(qzV.mul(tz));
      const qVecSq = qxV.mul(qxV).add(qyV.mul(qyV)).add(qzV.mul(qzV));
      const wSqMinusQVecSq = qwV.mul(qwV).sub(qVecSq);
      const crossX = qyV.mul(tz).sub(qzV.mul(ty));
      const crossY = qzV.mul(tx).sub(qxV.mul(tz));
      const crossZ = qxV.mul(ty).sub(qyV.mul(tx));

      const camX = dot.mul(2).mul(qxV).add(wSqMinusQVecSq.mul(tx)).add(qwV.mul(crossX).mul(2));
      const camY = dot.mul(2).mul(qyV).add(wSqMinusQVecSq.mul(ty)).add(qwV.mul(crossY).mul(2));
      const camZ = dot.mul(2).mul(qzV).add(wSqMinusQVecSq.mul(tz)).add(qwV.mul(crossZ).mul(2));

      // Project (convention: V = cy - fy * yNorm)
      const fx = camera.focalLength;
      const fy = camera.focalLength * camera.aspectRatio;
      const cx_intr = camera.principalPointX;
      const cy_intr = camera.principalPointY;

      const invZ = camZ.pow(-1);
      const normX = camX.mul(invZ);
      const normY = camY.mul(invZ);

      const u = normX.mul(fx).add(cx_intr);
      const v = new Value(cy_intr).sub(normY.mul(fy));

      // Reprojection residuals
      residuals.push(u.sub(imagePoint.u));
      residuals.push(v.sub(imagePoint.v));

      return residuals;
    };

    // Compute autodiff residuals and jacobian
    const autodiffResiduals = residualFn(autoVars);
    const numResiduals = autodiffResiduals.length;
    const numVariables = autoVars.length;

    // Build jacobian
    const jacobian: number[][] = [];
    const residualValues: number[] = [];

    for (let i = 0; i < numResiduals; i++) {
      residualValues.push(autodiffResiduals[i].data);

      Value.zeroGradTree(autodiffResiduals[i]);
      for (const v of autoVars) v.grad = 0;
      autodiffResiduals[i].backward();

      jacobian.push(autoVars.map((v) => v.grad));
    }

    // Compute autodiff J^T J
    const autodiffJtJ: number[][] = Array.from({ length: numVariables }, () =>
      new Array(numVariables).fill(0)
    );
    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        let sum = 0;
        for (let k = 0; k < numResiduals; k++) {
          sum += jacobian[k][i] * jacobian[k][j];
        }
        autodiffJtJ[i][j] = sum;
      }
    }

    // Compute autodiff cost
    const autodiffCost = residualValues.reduce((sum, r) => sum + r * r, 0);
    console.log('Autodiff cost:', autodiffCost);

    // Compare costs
    console.log('\nCost comparison:', analyticalNE.cost, 'vs', autodiffCost);
    expect(Math.abs(analyticalNE.cost - autodiffCost)).toBeLessThan(1e-4);

    // Compare J^T J diagonal
    console.log('\nJ^T J comparison (diagonal only):');
    let maxJtJDiff = 0;
    for (let i = 0; i < numVariables; i++) {
      const analytical = analyticalNE.JtJ.get(i, i);
      const autodiff = autodiffJtJ[i][i];
      const diff = Math.abs(analytical - autodiff);
      maxJtJDiff = Math.max(maxJtJDiff, diff);
      const relDiff = diff / Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
      console.log(
        `  [${i},${i}]: analytical=${analytical.toExponential(4)}, autodiff=${autodiff.toExponential(4)}, diff=${diff.toExponential(2)}, rel=${(relDiff * 100).toFixed(2)}%`
      );
    }
    console.log('Max J^T J diff:', maxJtJDiff);

    // Log significant J^T J differences
    console.log('\nJ^T J differences (>1%):');
    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        const analytical = analyticalNE.JtJ.get(i, j);
        const autodiff = autodiffJtJ[i][j];
        const diff = Math.abs(analytical - autodiff);
        const scale = Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
        const relDiff = diff / scale;
        if (relDiff > 0.01) {
          console.log(
            `  [${i},${j}]: analytical=${analytical.toFixed(4)}, autodiff=${autodiff.toFixed(4)}, relDiff=${(relDiff * 100).toFixed(1)}%`
          );
        }
      }
    }

    // Compare individual residuals
    console.log('\nResidual comparison:');
    for (let i = 0; i < numResiduals; i++) {
      const analytical = analyticalNE.residuals[i];
      const autodiff = residualValues[i];
      const diff = Math.abs(analytical - autodiff);
      console.log(`  [${i}]: analytical=${analytical.toFixed(6)}, autodiff=${autodiff.toFixed(6)}, diff=${diff.toExponential(2)}`);
    }

    // Compare jacobian rows
    console.log('\nJacobian row 0 (quat norm):');
    for (let j = 0; j < numVariables; j++) {
      const autodiff = jacobian[0][j];
      console.log(`  [0,${j}]: autodiff=${autodiff.toFixed(4)}`);
    }

    console.log('\nJacobian row 1 (reproj U):');
    for (let j = 0; j < numVariables; j++) {
      const autodiff = jacobian[1][j];
      console.log(`  [1,${j}]: autodiff=${autodiff.toFixed(4)}`);
    }

    console.log('\nJacobian row 2 (reproj V):');
    for (let j = 0; j < numVariables; j++) {
      const autodiff = jacobian[2][j];
      console.log(`  [2,${j}]: autodiff=${autodiff.toFixed(4)}`);
    }

    // Force failure to see output
    const errors: string[] = [];
    for (let i = 0; i < numVariables; i++) {
      for (let j = 0; j < numVariables; j++) {
        const analytical = analyticalNE.JtJ.get(i, j);
        const autodiff = autodiffJtJ[i][j];
        const diff = Math.abs(analytical - autodiff);
        const scale = Math.max(Math.abs(analytical), Math.abs(autodiff), 1);
        const relDiff = diff / scale;
        if (relDiff > 0.01) {
          errors.push(`[${i},${j}]: analytical=${analytical.toFixed(4)}, autodiff=${autodiff.toFixed(4)}, relDiff=${(relDiff * 100).toFixed(1)}%`);
        }
      }
    }

    // Compare residuals
    const residualErrors: string[] = [];
    for (let i = 0; i < numResiduals; i++) {
      const analytical = analyticalNE.residuals[i];
      const autodiff = residualValues[i];
      const diff = Math.abs(analytical - autodiff);
      if (diff > 1e-6) {
        residualErrors.push(`[${i}]: analytical=${analytical.toFixed(6)}, autodiff=${autodiff.toFixed(6)}, diff=${diff.toExponential(2)}`);
      }
    }

    // Compare per-provider gradients
    const gradientErrors: string[] = [];
    for (let p = 0; p < providers.length; p++) {
      const provider = providers[p];
      const analyticalGrad = provider.computeGradient(vars);
      const autodiffRow = jacobian[p];

      for (let i = 0; i < provider.variableIndices.length; i++) {
        const varIdx = provider.variableIndices[i];
        if (varIdx < 0) continue;
        const analyticalVal = analyticalGrad[i];
        const autodiffVal = autodiffRow[varIdx];
        const diff = Math.abs(analyticalVal - autodiffVal);
        const relDiff = diff / Math.max(Math.abs(analyticalVal), Math.abs(autodiffVal), 1);
        if (relDiff > 0.01) {
          gradientErrors.push(`Provider ${p}, grad[${i}] (var ${varIdx}): analytical=${analyticalVal.toFixed(4)}, autodiff=${autodiffVal.toFixed(4)}, relDiff=${(relDiff*100).toFixed(1)}%`);
        }
      }
    }

    if (errors.length > 0 || residualErrors.length > 0 || gradientErrors.length > 0) {
      throw new Error(
        `Residual mismatches:\n${residualErrors.join('\n') || 'none'}\n\n` +
        `Gradient mismatches:\n${gradientErrors.join('\n') || 'none'}\n\n` +
        `J^T J mismatches:\n${errors.join('\n') || 'none'}`
      );
    }
  });
});
