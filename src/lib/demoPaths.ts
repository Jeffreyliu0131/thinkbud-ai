export function demoRoute(path: '/' | '/practice' | '/showcase'): string {
  return import.meta.env.MODE === 'synthetic-demo' ? `${import.meta.env.BASE_URL}#${path}` : path
}

export function demoAsset(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`
}
