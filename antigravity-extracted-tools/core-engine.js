/**
 * Collie Engine Agent - Core Logic (Universal)
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');

const TOOLS = [
    { name: "execute_dynamic_code", description: "Ejecuta script en python, bash o js.", parameters: { language: "string", code: "string" } },
    { name: "run_command", description: "Ejecuta comando terminal.", parameters: { command: "string", isAsync: "boolean" } },
    { name: "command_status", description: "Estado de tarea asíncrona.", parameters: { taskId: "string" } },
    { name: "view_file", description: "Lee archivo.", parameters: { absolutePath: "string" } },
    { name: "write_to_file", description: "Escribe archivo.", parameters: { absolutePath: "string", content: "string" } },
    { name: "get_file_tree", description: "Árbol recursivo.", parameters: { absolutePath: "string" } },
    { name: "multi_replace_file_content", description: "Reemplazo múltiple.", parameters: { absolutePath: "string", replacements: "array" } },
    { name: "list_background_tasks", description: "Lista procesos.", parameters: {} }
];

async function executeUniversalTool(name, args, workspaceRoot, backgroundTasks) {
    return new Promise((resolve) => {
        try {
            if (name === "run_command") {
                if (args.isAsync) {
                    const taskId = 'task_' + Date.now();
                    const proc = cp.spawn(args.command, { shell: true, cwd: workspaceRoot });
                    const task = { proc, stdout: '', stderr: '', status: 'RUNNING' };
                    proc.stdout.on('data', d => task.stdout += d.toString());
                    proc.stderr.on('data', d => task.stderr += d.toString());
                    proc.on('close', code => { task.status = 'DONE'; task.exitCode = code; });
                    backgroundTasks.set(taskId, task);
                    resolve(`Task started: ${taskId}`);
                } else {
                    cp.exec(args.command, { cwd: workspaceRoot, maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
                        resolve(`EXIT_CODE: ${err ? err.code : 0}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
                    });
                }
            } else if (name === "command_status") {
                const task = backgroundTasks.get(args.taskId);
                if (!task) return resolve(`Error: Task ${args.taskId} not found.`);
                resolve(`STATUS: ${task.status}\nEXIT_CODE: ${task.exitCode ?? 'N/A'}\nSTDOUT:\n${task.stdout.substring(task.stdout.length - 2000)}`);
            } else if (name === "view_file") {
                resolve(fs.readFileSync(args.absolutePath, 'utf8').substring(0, 8000));
            } else if (name === "write_to_file") {
                fs.writeFileSync(args.absolutePath, args.content);
                resolve("Success");
            } else if (name === "get_file_tree") {
                const getTree = (dir, depth = 0) => {
                    if (depth > 2) return "";
                    let res = "";
                    const files = fs.readdirSync(dir, { withFileTypes: true });
                    files.forEach(f => {
                        res += `${"  ".repeat(depth)}${f.isDirectory() ? '📂' : '📄'} ${f.name}\n`;
                        if (f.isDirectory() && !f.name.includes('node_modules') && !f.name.startsWith('.')) {
                            res += getTree(path.join(dir, f.name), depth + 1);
                        }
                    });
                    return res;
                };
                resolve(getTree(args.absolutePath || workspaceRoot));
            } else if (name === "multi_replace_file_content") {
                let content = fs.readFileSync(args.absolutePath, 'utf8');
                let errors = [];
                args.replacements.forEach((r, idx) => {
                    if (content.includes(r.targetContent)) {
                        content = content.replace(r.targetContent, r.replacementContent);
                    } else {
                        errors.push(`Repl. #${idx} falló: No se encontró targetContent.`);
                    }
                });
                if (errors.length > 0) return resolve(`Error:\n${errors.join('\n')}`);
                fs.writeFileSync(args.absolutePath, content);
                resolve("Success");
            } else if (name === "list_background_tasks") {
                const tasks = Array.from(backgroundTasks.entries()).map(([id, t]) => `[${id}] ${t.status}`).join('\n');
                resolve(tasks || "No active tasks.");
            } else if (name === "execute_dynamic_code") {
                const extMap = { "bash": ".sh", "python": ".py", "javascript": ".js" };
                const cmdMap = { "bash": "bash", "python": "python3", "javascript": "node" };
                const ext = extMap[args.language.toLowerCase()];
                const cmd = cmdMap[args.language.toLowerCase()];
                if (!ext) return resolve("Language not supported");
                const tmpFile = path.join(os.tmpdir(), `dyn_${Date.now()}${ext}`);
                fs.writeFileSync(tmpFile, args.code);
                if (ext === '.sh') fs.chmodSync(tmpFile, "755");
                cp.exec(`${cmd} ${tmpFile}`, (err, stdout, stderr) => {
                    try { fs.unlinkSync(tmpFile); } catch(e){}
                    resolve(`STDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
                });
            } else {
                resolve(`Tool ${name} not found in core.`);
            }
        } catch (e) {
            resolve(`Core Error: ${e.message}`);
        }
    });
}

module.exports = { TOOLS, executeUniversalTool };
