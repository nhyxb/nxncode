import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import worker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
self.MonacoEnvironment={getWorker:()=>new worker()}
loader.config({monaco})
export { Editor, DiffEditor } from '@monaco-editor/react'

