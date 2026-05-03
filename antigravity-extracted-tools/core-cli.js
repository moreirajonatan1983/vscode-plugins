/**
 * Collie Engine CLI Wrapper
 * Permite que IntelliJ (Kotlin) ejecute herramientas del Core Engine (JS).
 */

const { executeUniversalTool } = require('./core-engine');
const path = require('path');

async function run() {
    const [,, name, argsJson, workspaceRoot] = process.argv;
    
    if (!name || !argsJson) {
        console.error("Usage: node core-cli.js <tool_name> <args_json> [workspace_root]");
        process.exit(1);
    }

    try {
        const args = JSON.parse(argsJson);
        const backgroundTasks = new Map(); // En el CLI, las tareas asíncronas son efímeras o gestionadas por el IDE
        const result = await executeUniversalTool(name, args, workspaceRoot || process.cwd(), backgroundTasks);
        console.log(result);
    } catch (e) {
        console.error(`CLI Error: ${e.message}`);
        process.exit(1);
    }
}

run();
