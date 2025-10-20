// Simple test to verify setup
describe('🧪 Testing Setup Verification', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test')
    expect(result).toBe('test')
  })

  it('should mock crypto.randomUUID', () => {
    const uuid = crypto.randomUUID()
    expect(uuid).toMatch(/^mock-uuid/)
  })

  it('should mock localStorage', () => {
    localStorage.setItem('test', 'value')
    expect(localStorage.getItem('test')).toBe('value')
  })
})