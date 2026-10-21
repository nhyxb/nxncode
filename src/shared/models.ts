import type { ModelRef, Wire } from './types'
export const modelKey = (model: Pick<ModelRef, 'providerID' | 'id'>) => model.providerID + '/' + model.id
export function selectableModels(models: Wire[], enabled?: string[]) {
 const allowed = enabled === undefined ? undefined : new Set(enabled)
 return models.filter(model => model.enabled !== false && (!allowed || allowed.has(modelKey(model as ModelRef))))
}
export function defaultVariant(model?: Wire, previous?: string) {
 const variants: Wire[] = model?.variants || []
 return variants.find(v => v.id === previous)?.id || variants.find(v => v.id === 'low')?.id || variants[0]?.id
}
