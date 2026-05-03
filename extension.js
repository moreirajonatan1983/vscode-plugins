const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Importación del Core Engine universal
const { TOOLS, executeUniversalTool } = require('./antigravity-extracted-tools/core-engine');

const KIRO_SYSTEM_PROMPT = `CORE: Eres Kiro (Senior Engineer) de la Organización.
REGLAS:
1. Idioma: Español.
2. PRIORIDAD: Calidad de código y seguridad.
3. CONTEXTO: Tienes acceso total al ecosistema de transportes local.

TOOLS: ${JSON.stringify(TOOLS)}
`;

const ANTIGRAVITY_SYSTEM_PROMPT = `CORE: Eres Antigravity (Staff Engineer). Resuelves tareas complejas con autonomía total.
REGLAS:
1. Eficiencia de tokens (46% ahorro).
2. Razonamiento ReAct.
3. Herramientas avanzadas habilitadas.

TOOLS: ${JSON.stringify(TOOLS)}
`;

// Mapa de tareas en background (gestión de procesos asíncronos)
const backgroundTasks = new Map();

/**
 * Obtiene el System Prompt basado en la configuración del usuario.
 */
function getActivePrompt() {
    const config = vscode.workspace.getConfiguration('antigravity');
    const provider = config.get('activeProvider', 'ANTIGRAVITY');
    return provider === 'KIRO' ? KIRO_SYSTEM_PROMPT : ANTIGRAVITY_SYSTEM_PROMPT;
}

/**
 * Ejecuta una herramienta delegando la lógica al Core Engine universal.
 * 
 * @param {string} name - Nombre de la herramienta.
 * @param {Object} args - Argumentos para la herramienta.
 * @param {string} workspaceRoot - Directorio raíz del workspace.
 * @returns {Promise<string>} Resultado de la ejecución.
 */
async function executeTool(name, args, workspaceRoot) {
    return executeUniversalTool(name, args, workspaceRoot, backgroundTasks);
}

/**
 * Punto de entrada principal de la extensión.
 * 
 * @param {vscode.ExtensionContext} context - El contexto de la extensión.
 */
function activate(context) {
    // Autoinstalación del cerebro de Antigravity en Kiro
    try {
        const homeDir = os.homedir();
        const kiroAgentsDir = path.join(homeDir, '.kiro', 'agents');
        const targetFile = path.join(kiroAgentsDir, 'che.md');
        
        if (!fs.existsSync(kiroAgentsDir)) {
            fs.mkdirSync(kiroAgentsDir, { recursive: true });
        }
        
        const sourceFile = path.join(context.extensionPath, 'antigravity-brain.md');
        if (fs.existsSync(sourceFile)) {
            fs.copyFileSync(sourceFile, targetFile);
            console.log('Antigravity Brain self-installed/updated successfully!');
            vscode.window.showInformationMessage('🧠 Antigravity Brain: Sistema actualizado y listo en el comando /che');
        }
    } catch (err) {
        console.error('Failed to self-install Antigravity Brain:', err);
    }

    // Comandos de utilidad para el chat
    const insertTagDirectCommand = vscode.commands.registerCommand('antigravity.insertTagDirect', async () => {
        await vscode.commands.executeCommand('type', { text: '@antigravity' });
        vscode.window.showInformationMessage('Etiqueta @antigravity insertada en el chat.');
    });
    context.subscriptions.push(insertTagDirectCommand);

    const insertTagCommand = vscode.commands.registerCommand('antigravity.insertTag', async () => {
        const tag = '@antigravity';
        await vscode.env.clipboard.writeText(tag);
        vscode.window.showInformationMessage('Tag "@antigravity" copiado al portapapeles.');
    });
    context.subscriptions.push(insertTagCommand);

    // Registro del Participante del Chat
    const participant = vscode.chat.createChatParticipant("antigravity.brain", async (request, contextChat, response, token) => {
        const startTime = Date.now();
        let logEntry = `\n[${new Date().toISOString()}] Request: ${request.prompt}\n`;
        
        try {
            const models = await vscode.lm.selectChatModels();
            if (!models || models.length === 0) {
                response.markdown("❌ Error: No hay modelos LLM disponibles.");
                return;
            }
            const model = models[0];

            let messages = [
                vscode.LanguageModelChatMessage.User(getActivePrompt()),
                vscode.LanguageModelChatMessage.User(request.prompt)
            ];

            const workspaceRoot = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : process.cwd();

            let maxLoops = 10;
            let currentLoop = 0;

            response.markdown(`🧠 *Pensando con el cerebro de Antigravity (Motor: ${model.vendor})...*\n\n`);

            while (currentLoop < maxLoops) {
                if (token.isCancellationRequested) break;

                const chatResponse = await model.sendRequest(messages, {}, token);
                let fullText = "";
                for await (const chunk of chatResponse.text) {
                    fullText += chunk;
                }

                // Check for tool call
                const toolRegex = /\`\`\`tool_call\n([\s\S]*?)\n\`\`\`/i;
                const match = fullText.match(toolRegex);

                if (match) {
                    response.markdown(fullText.replace(match[0], "")); // Print thought process
                    
                    try {
                        const callJson = JSON.parse(match[1]);
                        response.markdown(`\n⚙️ **Ejecutando:** \`${callJson.name}\`...\n`);
                        
                        const result = await executeTool(callJson.name, callJson.args, workspaceRoot);
                        
                        response.markdown(`\`\`\`\n${result.substring(0, 200)}...\n\`\`\`\n`);

                        messages.push(vscode.LanguageModelChatMessage.Assistant(fullText));
                        messages.push(vscode.LanguageModelChatMessage.User(`TOOL_RESULT:\n${result}\n\nContinúa.`));
                        currentLoop++;
                    } catch(e) {
                        response.markdown(`\n❌ Error parseando tool call: ${e.message}\n`);
                        break;
                    }
                } else {
                    response.markdown(fullText);
                    break;
                }
            }
        } catch (err) {
            response.markdown(`\n❌ Error interno: ${err.message}`);
        }
    });

    participant.iconPath = new vscode.ThemeIcon('hubot');
    context.subscriptions.push(participant);
}

function deactivate() {}

module.exports = { activate, deactivate }
