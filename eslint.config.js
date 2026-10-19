import js from '@eslint/js';import globals from 'globals';
export default [{ignores:['node_modules/**','evidence/**','test-results/**']},js.configs.recommended,{languageOptions:{globals:{...globals.browser,...globals.node,chrome:'readonly',NextClickLab:'readonly'}}}];
