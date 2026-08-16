import { describe, it, expect } from 'vite-plus/test'
import { mount } from '@vue/test-utils'
import HomeView from '../HomeView.vue'

describe('HomeView', () => {
  it('renders the title', () => {
    const wrapper = mount(HomeView)
    expect(wrapper.text()).toContain('Blueberry Academy')
  })
})
