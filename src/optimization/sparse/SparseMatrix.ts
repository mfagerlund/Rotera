/**
 * Sparse Matrix in CSR (Compressed Sparse Row) format.
 *
 * Efficient for row operations, matrix-vector multiplication, and J^T J computation.
 * Ported from Colonel.Core.Optimization.SparseMatrix.
 */

export interface Triplet {
  row: number;
  col: number;
  value: number;
}

export class SparseMatrix {
  /** Row pointers - rowPointers[i] is the index into values/colIndices where row i starts */
  readonly rowPointers: number[];

  /** Column indices for each non-zero value */
  readonly colIndices: number[];

  /** Non-zero values */
  readonly values: number[];

  /** Number of rows */
  readonly rows: number;

  /** Number of columns */
  readonly cols: number;

  private constructor(
    rows: number,
    cols: number,
    rowPointers: number[],
    colIndices: number[],
    values: number[]
  ) {
    this.rows = rows;
    this.cols = cols;
    this.rowPointers = rowPointers;
    this.colIndices = colIndices;
    this.values = values;
  }

  /** Number of non-zero entries */
  get nonZeroCount(): number {
    return this.values.length;
  }

  /** Sparsity ratio (fraction of zero entries) */
  get sparsity(): number {
    return 1.0 - this.nonZeroCount / (this.rows * this.cols);
  }

  /**
   * Creates a sparse matrix from COO (coordinate) format triplets.
   */
  static fromTriplets(rows: number, cols: number, triplets: Triplet[]): SparseMatrix {
    // Sort by row, then by column
    triplets.sort((a, b) => {
      const rowCmp = a.row - b.row;
      return rowCmp !== 0 ? rowCmp : a.col - b.col;
    });

    // Merge duplicates (sum values at same position)
    const merged: Triplet[] = [];
    for (const t of triplets) {
      if (merged.length > 0) {
        const last = merged[merged.length - 1];
        if (last.row === t.row && last.col === t.col) {
          last.value += t.value;
          continue;
        }
      }
      if (Math.abs(t.value) > 1e-15) {
        // Skip near-zero values
        merged.push({ row: t.row, col: t.col, value: t.value });
      }
    }

    const nnz = merged.length;
    const rowPointers = new Array<number>(rows + 1);
    const colIndices = new Array<number>(nnz);
    const values = new Array<number>(nnz);

    let idx = 0;
    for (let row = 0; row < rows; row++) {
      rowPointers[row] = idx;
      while (idx < nnz && merged[idx].row === row) {
        colIndices[idx] = merged[idx].col;
        values[idx] = merged[idx].value;
        idx++;
      }
    }
    rowPointers[rows] = nnz;

    return new SparseMatrix(rows, cols, rowPointers, colIndices, values);
  }

  /**
   * Creates a sparse matrix from a dense 2D array.
   */
  static fromDense(dense: number[][]): SparseMatrix {
    const rows = dense.length;
    const cols = rows > 0 ? dense[0].length : 0;
    const triplets: Triplet[] = [];

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (Math.abs(dense[i][j]) > 1e-15) {
          triplets.push({ row: i, col: j, value: dense[i][j] });
        }
      }
    }

    return SparseMatrix.fromTriplets(rows, cols, triplets);
  }

  /**
   * Creates a sparse identity matrix.
   */
  static identity(n: number): SparseMatrix {
    const triplets: Triplet[] = [];
    for (let i = 0; i < n; i++) {
      triplets.push({ row: i, col: i, value: 1 });
    }
    return SparseMatrix.fromTriplets(n, n, triplets);
  }

  /**
   * Creates a sparse matrix using a builder pattern for efficient row-by-row construction.
   */
  static createBuilder(rows: number, cols: number, estimatedNnzPerRow = 4): SparseMatrixBuilder {
    return new SparseMatrixBuilder(rows, cols, estimatedNnzPerRow);
  }

  /**
   * Gets a value at (row, col). Returns 0 if not present.
   * O(log(nnz_in_row)) due to binary search.
   */
  get(row: number, col: number): number {
    let start = this.rowPointers[row];
    let end = this.rowPointers[row + 1];

    // Binary search within the row
    while (start < end) {
      const mid = (start + end) >> 1;
      if (this.colIndices[mid] === col) {
        return this.values[mid];
      }
      if (this.colIndices[mid] < col) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }
    return 0;
  }

  /**
   * Multiplies this matrix by a vector: y = A * x
   */
  multiply(x: number[]): number[] {
    if (x.length !== this.cols) {
      throw new Error(`Vector length ${x.length} does not match matrix columns ${this.cols}`);
    }

    const y = new Array<number>(this.rows).fill(0);
    for (let row = 0; row < this.rows; row++) {
      let sum = 0;
      for (let idx = this.rowPointers[row]; idx < this.rowPointers[row + 1]; idx++) {
        sum += this.values[idx] * x[this.colIndices[idx]];
      }
      y[row] = sum;
    }
    return y;
  }

  /**
   * Multiplies this matrix transpose by a vector: y = A^T * x
   */
  transposeMultiply(x: number[]): number[] {
    if (x.length !== this.rows) {
      throw new Error(`Vector length ${x.length} does not match matrix rows ${this.rows}`);
    }

    const y = new Array<number>(this.cols).fill(0);
    for (let row = 0; row < this.rows; row++) {
      const xRow = x[row];
      for (let idx = this.rowPointers[row]; idx < this.rowPointers[row + 1]; idx++) {
        y[this.colIndices[idx]] += this.values[idx] * xRow;
      }
    }
    return y;
  }

  /**
   * Computes J^T * J where this matrix is J.
   * Returns a sparse symmetric matrix.
   */
  computeJtJ(): SparseMatrix {
    // For each column pair (i, j), compute sum over rows k of J[k,i] * J[k,j]
    // Only compute upper triangle since result is symmetric

    const triplets: Triplet[] = [];

    // For each row of J, contribute to J^T J
    for (let k = 0; k < this.rows; k++) {
      const rowStart = this.rowPointers[k];
      const rowEnd = this.rowPointers[k + 1];

      // For each pair of non-zeros in this row
      for (let idx1 = rowStart; idx1 < rowEnd; idx1++) {
        const i = this.colIndices[idx1];
        const vi = this.values[idx1];

        for (let idx2 = idx1; idx2 < rowEnd; idx2++) {
          const j = this.colIndices[idx2];
          const vj = this.values[idx2];

          const contrib = vi * vj;
          triplets.push({ row: i, col: j, value: contrib });
          if (i !== j) {
            triplets.push({ row: j, col: i, value: contrib }); // Symmetric
          }
        }
      }
    }

    return SparseMatrix.fromTriplets(this.cols, this.cols, triplets);
  }

  /**
   * Computes J^T * r where this matrix is J and r is the residual vector.
   */
  computeJtr(r: number[]): number[] {
    return this.transposeMultiply(r);
  }

  /**
   * Adds lambda to the diagonal (for Levenberg-Marquardt damping).
   * Returns a new matrix.
   */
  addDiagonal(lambda: number): SparseMatrix {
    const triplets: Triplet[] = [];

    // Copy existing entries
    for (let row = 0; row < this.rows; row++) {
      for (let idx = this.rowPointers[row]; idx < this.rowPointers[row + 1]; idx++) {
        triplets.push({ row, col: this.colIndices[idx], value: this.values[idx] });
      }
    }

    // Add to diagonal
    const diag = Math.min(this.rows, this.cols);
    for (let i = 0; i < diag; i++) {
      triplets.push({ row: i, col: i, value: lambda });
    }

    return SparseMatrix.fromTriplets(this.rows, this.cols, triplets);
  }

  /**
   * Converts to dense 2D array (for debugging/small matrices).
   */
  toDense(): number[][] {
    const dense: number[][] = Array.from({ length: this.rows }, () =>
      new Array<number>(this.cols).fill(0)
    );

    for (let row = 0; row < this.rows; row++) {
      for (let idx = this.rowPointers[row]; idx < this.rowPointers[row + 1]; idx++) {
        dense[row][this.colIndices[idx]] = this.values[idx];
      }
    }

    return dense;
  }

  /**
   * Gets diagonal values as an array.
   */
  getDiagonal(): number[] {
    const diag = new Array<number>(Math.min(this.rows, this.cols)).fill(0);
    for (let i = 0; i < diag.length; i++) {
      diag[i] = this.get(i, i);
    }
    return diag;
  }
}

/**
 * Builder for efficient row-by-row sparse matrix construction.
 */
export class SparseMatrixBuilder {
  private readonly _rows: number;
  private readonly _cols: number;
  private readonly _rowPointers: number[];
  private readonly _colIndices: number[];
  private readonly _values: number[];
  private _currentRow: number;

  constructor(rows: number, cols: number, estimatedNnzPerRow: number) {
    this._rows = rows;
    this._cols = cols;
    this._rowPointers = [0];
    this._colIndices = [];
    this._values = [];
    this._currentRow = 0;

    // Pre-allocate estimated capacity
    const estimatedNnz = rows * estimatedNnzPerRow;
    // Arrays will grow as needed
  }

  /**
   * Starts a new row. Must be called in order from row 0 to rows-1.
   */
  beginRow(row: number): void {
    if (row !== this._currentRow) {
      throw new Error(`Expected row ${this._currentRow}, got ${row}`);
    }
  }

  /**
   * Adds a non-zero entry to the current row.
   * Columns must be added in ascending order within each row.
   */
  add(col: number, value: number): void {
    if (Math.abs(value) < 1e-15) return; // Skip near-zeros

    if (
      this._colIndices.length > this._rowPointers[this._currentRow] &&
      col <= this._colIndices[this._colIndices.length - 1]
    ) {
      throw new Error('Columns must be added in ascending order');
    }

    this._colIndices.push(col);
    this._values.push(value);
  }

  /**
   * Ends the current row and moves to the next.
   */
  endRow(): void {
    this._currentRow++;
    this._rowPointers.push(this._colIndices.length);
  }

  /**
   * Adds a complete row of entries (columns and values must be same length).
   * Columns must be in ascending order.
   */
  addRow(cols: number[], vals: number[]): void {
    for (let i = 0; i < cols.length; i++) {
      this.add(cols[i], vals[i]);
    }
    this.endRow();
  }

  /**
   * Builds the final sparse matrix.
   */
  build(): SparseMatrix {
    // Fill remaining rows if not all were added
    while (this._currentRow < this._rows) {
      this._rowPointers.push(this._colIndices.length);
      this._currentRow++;
    }

    return SparseMatrix.fromTriplets(
      this._rows,
      this._cols,
      this._colIndices.map((col, i) => ({
        row: this._findRowForIndex(i),
        col,
        value: this._values[i],
      }))
    );
  }

  private _findRowForIndex(idx: number): number {
    for (let row = 0; row < this._rowPointers.length - 1; row++) {
      if (idx >= this._rowPointers[row] && idx < this._rowPointers[row + 1]) {
        return row;
      }
    }
    return this._rows - 1;
  }
}
