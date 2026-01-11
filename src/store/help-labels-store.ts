import { makeAutoObservable } from 'mobx'

class HelpLabelsStore {
  isEnabled = false

  constructor() {
    makeAutoObservable(this)
  }

  toggle() {
    this.isEnabled = !this.isEnabled
  }

  enable() {
    this.isEnabled = true
  }

  disable() {
    this.isEnabled = false
  }
}

export const helpLabelsStore = new HelpLabelsStore()
