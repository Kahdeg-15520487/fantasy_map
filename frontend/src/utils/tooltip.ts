/** Position a tooltip relative to #map-container. */
export function positionTooltip(tooltipEl: HTMLElement, event: MouseEvent): void {
  const container = document.getElementById('map-container')
  if (!container) {
    tooltipEl.style.left = (event.clientX + 12) + 'px'
    tooltipEl.style.top = (event.clientY - 10) + 'px'
    return
  }
  const rect = container.getBoundingClientRect()
  tooltipEl.style.left = (event.clientX - rect.left + 12) + 'px'
  tooltipEl.style.top = (event.clientY - rect.top - 10) + 'px'
}
