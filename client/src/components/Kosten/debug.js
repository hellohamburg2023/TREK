const fs = require('fs')
const content = fs.readFileSync('/Users/gs/Repo/TREK/client/src/components/Kosten/KostenPanel.tsx', 'utf8')
const match = content.match(/function SettlementFormModal[\s\S]*?return \(/)
console.log(match[0])
