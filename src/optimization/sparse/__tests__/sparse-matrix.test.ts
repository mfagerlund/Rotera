/**
 * Tests for SparseMatrix operations.
 */

import { SparseMatrix } from '../SparseMatrix';

describe('SparseMatrix', () => {
  describe('fromDense', () => {
    it('creates sparse matrix from dense', () => {
      const dense = [
        [1, 0, 2],
        [0, 3, 0],
        [4, 0, 5],
      ];
      const sparse = SparseMatrix.fromDense(dense);

      expect(sparse.rows).toBe(3);
      expect(sparse.cols).toBe(3);
      expect(sparse.nonZeroCount).toBe(5);

      expect(sparse.get(0, 0)).toBe(1);
      expect(sparse.get(0, 1)).toBe(0);
      expect(sparse.get(0, 2)).toBe(2);
      expect(sparse.get(1, 1)).toBe(3);
      expect(sparse.get(2, 0)).toBe(4);
      expect(sparse.get(2, 2)).toBe(5);
    });

    it('handles empty rows', () => {
      const dense = [
        [1, 0, 0],
        [0, 0, 0],
        [0, 0, 2],
      ];
      const sparse = SparseMatrix.fromDense(dense);

      expect(sparse.nonZeroCount).toBe(2);
      expect(sparse.get(0, 0)).toBe(1);
      expect(sparse.get(1, 1)).toBe(0);
      expect(sparse.get(2, 2)).toBe(2);
    });
  });

  describe('fromTriplets', () => {
    it('merges duplicate entries', () => {
      const triplets = [
        { row: 0, col: 0, value: 1 },
        { row: 0, col: 0, value: 2 }, // Duplicate - should sum
        { row: 1, col: 1, value: 3 },
      ];
      const sparse = SparseMatrix.fromTriplets(2, 2, triplets);

      expect(sparse.get(0, 0)).toBe(3); // 1 + 2
      expect(sparse.get(1, 1)).toBe(3);
    });

    it('handles unsorted triplets', () => {
      const triplets = [
        { row: 1, col: 1, value: 3 },
        { row: 0, col: 0, value: 1 },
        { row: 0, col: 2, value: 2 },
      ];
      const sparse = SparseMatrix.fromTriplets(2, 3, triplets);

      expect(sparse.get(0, 0)).toBe(1);
      expect(sparse.get(0, 2)).toBe(2);
      expect(sparse.get(1, 1)).toBe(3);
    });
  });

  describe('identity', () => {
    it('creates identity matrix', () => {
      const I = SparseMatrix.identity(3);

      expect(I.rows).toBe(3);
      expect(I.cols).toBe(3);
      expect(I.nonZeroCount).toBe(3);

      expect(I.get(0, 0)).toBe(1);
      expect(I.get(1, 1)).toBe(1);
      expect(I.get(2, 2)).toBe(1);
      expect(I.get(0, 1)).toBe(0);
    });
  });

  describe('multiply', () => {
    it('multiplies matrix by vector', () => {
      const dense = [
        [1, 0, 2],
        [0, 3, 0],
        [4, 0, 5],
      ];
      const sparse = SparseMatrix.fromDense(dense);
      const x = [1, 2, 3];

      const y = sparse.multiply(x);

      // [1*1 + 0*2 + 2*3, 0*1 + 3*2 + 0*3, 4*1 + 0*2 + 5*3]
      expect(y).toEqual([7, 6, 19]);
    });

    it('matches dense multiplication', () => {
      const dense = [
        [2, -1, 0],
        [-1, 2, -1],
        [0, -1, 2],
      ];
      const sparse = SparseMatrix.fromDense(dense);
      const x = [1, 2, 3];

      const y = sparse.multiply(x);

      // Dense multiply
      const expected = dense.map((row) => row.reduce((sum, v, j) => sum + v * x[j], 0));

      expect(y).toEqual(expected);
    });

    it('throws on dimension mismatch', () => {
      const sparse = SparseMatrix.fromDense([
        [1, 2],
        [3, 4],
      ]);

      expect(() => sparse.multiply([1, 2, 3])).toThrow();
    });
  });

  describe('transposeMultiply', () => {
    it('multiplies transpose by vector', () => {
      const dense = [
        [1, 2],
        [3, 4],
        [5, 6],
      ];
      const sparse = SparseMatrix.fromDense(dense);
      const x = [1, 2, 3];

      const y = sparse.transposeMultiply(x);

      // A^T * x = [1*1 + 3*2 + 5*3, 2*1 + 4*2 + 6*3]
      expect(y).toEqual([22, 28]);
    });

    it('matches dense transpose multiply', () => {
      const dense = [
        [1, 2, 3],
        [4, 5, 6],
      ];
      const sparse = SparseMatrix.fromDense(dense);
      const x = [1, 2];

      const y = sparse.transposeMultiply(x);

      // Transpose of dense
      const denseT = [
        [1, 4],
        [2, 5],
        [3, 6],
      ];
      const expected = denseT.map((row) => row.reduce((sum, v, j) => sum + v * x[j], 0));

      expect(y).toEqual(expected);
    });
  });

  describe('computeJtJ', () => {
    it('computes J^T * J correctly', () => {
      // J = [1, 2]
      //     [3, 4]
      // J^T J = [1, 3]   [1, 2]   [10, 14]
      //         [2, 4] * [3, 4] = [14, 20]
      const J = SparseMatrix.fromDense([
        [1, 2],
        [3, 4],
      ]);

      const JtJ = J.computeJtJ();

      expect(JtJ.rows).toBe(2);
      expect(JtJ.cols).toBe(2);
      expect(JtJ.get(0, 0)).toBe(10);
      expect(JtJ.get(0, 1)).toBe(14);
      expect(JtJ.get(1, 0)).toBe(14);
      expect(JtJ.get(1, 1)).toBe(20);
    });

    it('produces symmetric matrix', () => {
      const J = SparseMatrix.fromDense([
        [1, 0, 2],
        [0, 3, 1],
        [2, 1, 0],
      ]);

      const JtJ = J.computeJtJ();

      // Check symmetry
      for (let i = 0; i < JtJ.rows; i++) {
        for (let j = 0; j < JtJ.cols; j++) {
          expect(JtJ.get(i, j)).toBeCloseTo(JtJ.get(j, i), 10);
        }
      }
    });

    it('handles sparse Jacobian correctly', () => {
      // Sparse Jacobian with specific sparsity pattern
      const triplets = [
        { row: 0, col: 0, value: 2 },
        { row: 0, col: 2, value: 1 },
        { row: 1, col: 1, value: 3 },
        { row: 2, col: 0, value: 1 },
        { row: 2, col: 1, value: 1 },
      ];
      const J = SparseMatrix.fromTriplets(3, 3, triplets);

      const JtJ = J.computeJtJ();

      // Verify diagonal: sum of squares of column entries
      expect(JtJ.get(0, 0)).toBe(2 * 2 + 1 * 1); // 5
      expect(JtJ.get(1, 1)).toBe(3 * 3 + 1 * 1); // 10
      expect(JtJ.get(2, 2)).toBe(1 * 1); // 1
    });
  });

  describe('computeJtr', () => {
    it('computes J^T * r correctly', () => {
      const J = SparseMatrix.fromDense([
        [1, 2],
        [3, 4],
      ]);
      const r = [1, 2];

      const Jtr = J.computeJtr(r);

      // J^T * r = [1, 3] * [1]   [7]
      //           [2, 4]   [2] = [10]
      expect(Jtr).toEqual([7, 10]);
    });
  });

  describe('addDiagonal', () => {
    it('adds lambda to diagonal', () => {
      const A = SparseMatrix.fromDense([
        [1, 2],
        [3, 4],
      ]);

      const B = A.addDiagonal(10);

      expect(B.get(0, 0)).toBe(11);
      expect(B.get(0, 1)).toBe(2);
      expect(B.get(1, 0)).toBe(3);
      expect(B.get(1, 1)).toBe(14);
    });

    it('preserves sparsity pattern for off-diagonal', () => {
      const A = SparseMatrix.fromDense([
        [1, 0, 0],
        [0, 2, 0],
        [0, 0, 3],
      ]);

      const B = A.addDiagonal(1);

      expect(B.nonZeroCount).toBe(3);
      expect(B.get(0, 0)).toBe(2);
      expect(B.get(1, 1)).toBe(3);
      expect(B.get(2, 2)).toBe(4);
    });
  });

  describe('toDense', () => {
    it('converts back to dense correctly', () => {
      const original = [
        [1, 0, 2],
        [0, 3, 0],
        [4, 0, 5],
      ];
      const sparse = SparseMatrix.fromDense(original);
      const dense = sparse.toDense();

      expect(dense).toEqual(original);
    });
  });

  describe('getDiagonal', () => {
    it('extracts diagonal', () => {
      const A = SparseMatrix.fromDense([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]);

      const diag = A.getDiagonal();

      expect(diag).toEqual([1, 5, 9]);
    });

    it('handles missing diagonal entries', () => {
      const A = SparseMatrix.fromDense([
        [0, 1],
        [1, 0],
      ]);

      const diag = A.getDiagonal();

      expect(diag).toEqual([0, 0]);
    });
  });

  describe('sparsity', () => {
    it('computes sparsity ratio', () => {
      const A = SparseMatrix.fromDense([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]);

      // 3 non-zeros out of 9 = 6/9 = 2/3 sparsity
      expect(A.sparsity).toBeCloseTo(2 / 3, 10);
    });
  });
});
