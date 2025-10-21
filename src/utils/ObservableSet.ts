export class ObservableSet<T> extends Set<T> {
  private _version = 0

  get version(): number {
    return this._version
  }

  add(value: T): this {
    super.add(value)
    this._version++
    return this
  }

  delete(value: T): boolean {
    const result = super.delete(value)
    if (result) {
      this._version++
    }
    return result
  }

  clear(): void {
    if (this.size > 0) {
      super.clear()
      this._version++
    }
  }
}
