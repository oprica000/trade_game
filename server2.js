var express = require('express');
var mysql = require('mysql');
var app = express();
var server = require('http').createServer(app);
var io =require('socket.io').listen(server);
var timer = 600 * 1000;
users = [];
connections = [];
app.use(express.static(__dirname + '/public'));
server.listen(process.env.PORT || 4000);
console.log('Server running...');

var DBconnection = mysql.createConnection({
    //properties
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'trade_game',
    multipleStatements: true
});

DBconnection.connect(function(error){
    if(error){
        console.log('Error on DB');
    }else{
        console.log('Connected to DB');
    }
});

app.get('/', function(req, res){
    res.sendFile(__dirname + '/public/index2.html');
});

//game end
setTimeout(function(){
    DBconnection.query("SELECT Username, Wood, Stone, Iron, Wheat, Points FROM players ORDER BY (Points + Wood + Stone + Iron + Wheat) DESC", function(error, res){
        if(error){
            throw error;
        }else{
            console.log(res);
            io.sockets.emit('end game', res);
        }
    });
    DBconnection.query("DELETE FROM chat");
    DBconnection.query("DELETE FROM players");
    console.log('game ended');}, timer);


io.sockets.on('connection', function(socket){

    var ownWood = getRndInteger(0,9);
    var ownStone = getRndInteger(0,9);
    var ownIron = getRndInteger(0,9);
    var ownWheat = getRndInteger(0,9);

    while(ownWood + ownStone + ownIron + ownWheat != 8){
        ownWood = getRndInteger(0,8);
        ownStone = getRndInteger(0,8);
        ownIron = getRndInteger(0,8);
        ownWheat = getRndInteger(0,8);
    }

    var sql = "INSERT INTO players (Socket, Wood, Iron, Stone, Wheat, BuildingAID, BuildingBID, BuildingCID, Points) VALUES ('" + socket.id +"', " 
                        + ownWood +", " + ownStone + ", " + ownIron + ", " + ownWheat + ", "
                        + getRndInteger(1, 5) + ", " + getRndInteger(5, 10) + ", " + getRndInteger(10, 12) + ", " + 0 +")";
    DBconnection.query(sql, function(error, res){
        if(error){
            throw error;
        }else{
            console.log(socket.id + " inserted");
        }
    });

    //Disconnect
    socket.on('disconnect', function(data){

        var sql = "DELETE FROM players WHERE socket = '" + socket.id + "'";
    DBconnection.query(sql, function(error, res){
        if(error){
            throw error;
        }else{
            console.log(socket.id + " deleted");
        }
    });

        users.splice(users.indexOf(socket.username), 1);
        updateUsernames();
        updateTotalResources();
        connections.splice(connections.indexOf(socket), 1);
        console.log('Disconnected: %s sockets connected', connections.length);
    });

    socket.on('new offer', function(data){
        var senderUsername = socket.username;
        io.to(connections[data.destinationIndex].id).emit('show offer', {senderUsername: senderUsername, 
            initiator_wood: data.initiator_wood, give_wood: data.give_wood, get_wood: data.get_wood, 
            initiator_stone: data.initiator_stone, give_stone: data.give_stone, get_stone: data.get_stone,
            initiator_iron: data.initiator_iron, give_iron: data.give_iron, get_iron: data.get_iron,
            initiator_wheat: data.initiator_wheat, give_wheat: data.give_wheat, get_wheat: data.get_wheat});
    });

    socket.on('offer refused', function(data){
        var info = data.split(',');

        io.to(connections[users.indexOf(info[0])].id).emit('show refuse', socket.username);
    });

    socket.on('offer accepted', function(data){
        var info = data.split(',');
        //senderUsername + ',' + initiator_wood + ',' + give_wood + ',' + accepter_wood + ',' + get_wood

        var wood1 = parseInt(info[3]) + parseInt(info[2]) - parseInt(info[4]);
        // console.log('compW '+wood1);
        var stone1 = parseInt(info[7]) + parseInt(info[6]) - parseInt(info[8]);
        // console.log('compS '+stone1);
        var iron1 = parseInt(info[11]) + parseInt(info[10]) - parseInt(info[12]);
        // console.log('compI'+iron1);
        var wheat1 = parseInt(info[15]) + parseInt(info[14]) - parseInt(info[16]);

        var sql1 = "UPDATE players SET WOOD = " + wood1 + ", STONE = " + stone1 + ", IRON = " + iron1 + ", WHEAT = " + wheat1 + " WHERE  Socket = '" + socket.id + "'";
        DBconnection.query(sql1, function(){});

        var wood2 = parseInt(info[1]) + parseInt(info[4]) - parseInt(info[2]);
        var stone2 = parseInt(info[5]) + parseInt(info[8]) - parseInt(info[6]);
        var iron2 = parseInt(info[9]) + parseInt(info[12]) - parseInt(info[10]);
        var wheat2 = parseInt(info[13]) + parseInt(info[16]) - parseInt(info[14]);



        var sql2 = "UPDATE players SET WOOD = " + wood2 + ", STONE = " + stone2 + ", IRON = " + iron2 + ", WHEAT = " + wheat2 + " WHERE  Socket = '" + connections[users.indexOf(info[0])].id + "'";
        DBconnection.query(sql2, function(){});

        DBconnection.query("SELECT Wood, Stone, Iron, Wheat, Points FROM players WHERE Socket = '" + socket.id + "'", function(error, res){
            if(error){
                //console.log("resource query error");
                throw error;
            }else{
                io.to(socket.id).emit('update own resources', res);
            }
        });
        DBconnection.query("SELECT Wood, Stone, Iron, Wheat, Points FROM players WHERE Socket = '" + connections[users.indexOf(info[0])].id + "'", function(error, res){
            if(error){
                //console.log("resource query error");
                throw error;
            }else{
                io.to(connections[users.indexOf(info[0])].id).emit('update own resources', res);
            }
        });
        updateTotalResources();
        updateUsernames();
        io.to(connections[users.indexOf(info[0])].id).emit('show accept', socket.username);
    });

    //Send message
    socket.on('send message', function(data){
        io.sockets.emit('new message', {msg: data, user: socket.username});
        var sql = "INSERT INTO chat (Username, Message) VALUES ('" + socket.username +"', '" + data + "')";
        DBconnection.query(sql, function(error, res){
            if(error){
                throw error;
            }else{
                //console.log("message inserted");
            }
        });
    });

    //Build
    socket.on('build', function(data){

        //data is building ID, querry as needed
        var sql = "SELECT players.Socket, buildings.PointReward, players.Points, buildings.WoodCost, buildings.StoneCost, buildings.IronCost, buildings.WheatCost, players.Wood, players.Stone, players.Iron, players.Wheat FROM buildings, players WHERE players.Socket ='" + socket.id + "' AND buildings.ID = " + data;
        DBconnection.query(sql, function(error, res){
            if(error){
                throw error;
            }else{
                if(res[0].WoodCost <= res[0].Wood && res[0].StoneCost <= res[0].Stone && res[0].IronCost <= res[0].Iron && res[0].WheatCost <= res[0].Wheat){
                    if(data == 6){
                        var wood = res[0].Wood - res[0].WoodCost + 1;
                    }else{
                        var wood = res[0].Wood - res[0].WoodCost;
                    }
                    if(data == 7){
                        var stone = res[0].Stone - res[0].StoneCost + 1;
                    }else{
                        var stone = res[0].Stone - res[0].StoneCost;
                    }
                    if(data == 8){
                        var iron = res[0].Iron - res[0].IronCost + 1;
                    }else{
                        var iron = res[0].Iron - res[0].IronCost;
                    }
                    if(data == 9){
                        var wheat = res[0].Wheat - res[0].WheatCost + 1;
                    }else{
                        var wheat = res[0].Wheat - res[0].WheatCost;
                    }
                    var pts = res[0].Points + res[0].PointReward;
                    //console.log(pts);
                    DBconnection.query("UPDATE players SET Points = " + pts + ", Wood = " + wood +", Stone = " + stone + ", Iron = " + iron + ", Wheat = " + wheat + " WHERE  Socket = '" + res[0].Socket + "'",function(error, res){
                        if(error){
                            throw error;
                        }else{
                            DBconnection.query("SELECT Wood, Stone, Iron, Wheat, Points FROM players WHERE Socket = '" + socket.id + "'", function(error, res){
                                if(error){
                                    //console.log("resource query error");
                                    throw error;
                                }else{
                                    io.to(socket.id).emit('update own resources', res);
                                }
                            });
                            updateTotalResources();
                            io.sockets.emit('check tax', socket.id);
                            io.to(socket.id).emit('finalize build', data);

                        }
                    });
                }else{
                    io.to(socket.id).emit('refuse build');
                }
            }
        });
    });

    socket.on('give tax', function(data){
        DBconnection.query("UPDATE players SET Points = " + (data + 1) + " WHERE  Socket = '" + socket.id + "'",function(error, res){
            if(error){
                throw error;
            }else{
                DBconnection.query("SELECT Wood, Stone, Iron, Wheat, Points FROM players WHERE Socket = '" + socket.id + "'", function(error, res){
                    if(error){
                        console.log("resource query error at 236");
                        throw error;
                    }else{
                        io.to(socket.id).emit('update own resources', res);
                    }
                });
            }
        });
    });

    //New user
    socket.on('new user', function(data, callback){
        if(users.indexOf(data)==-1){
            callback(true);
            socket.username = data;
            DBconnection.query("UPDATE players SET Username = '" + data + "' WHERE Socket = '" + socket.id + "'");
            users.push(socket.username);
            connections.push(socket);
            console.log('Connected: %s sockets connected', connections.length);
            updateUsernames();
            updateChat();
            //updateOwnResources
            DBconnection.query("SELECT Wood, Stone, Iron, Wheat, Points FROM players WHERE Socket = '" + socket.id + "'", function(error, res){
                if(error){
                    console.log("resource query error at line 261");
                    throw error;
                }else{
                    io.to(socket.id).emit('update own resources', res);
                }
            });

            //updateBuildings
            DBconnection.query("SELECT buildings.* FROM buildings, players WHERE players.Socket = '" + socket.id + "' AND (buildings.ID = players.BuildingAID OR buildings.ID = players.BuildingBID OR buildings.ID = players.BuildingCID)", function(error, res){
                if(error){
                    //console.log("resource query error");
                    throw error;
                }else{
                    io.to(socket.id).emit('update buildings', res);
                }
            });

            updateTotalResources();
        }else{
            io.to(socket.id).emit('refuse username');
        }
    });

    function updateUsernames(){
        io.sockets.emit('get users', users);
    }

    function updateChat(){
        DBconnection.query("SELECT * FROM chat", function(error, res){
            if(error){
                console.log("chat query error");
            }else{
                io.sockets.emit('inititalize chat', res);
            }
        });
    }

    function updateTotalResources(){
        DBconnection.query("SELECT Sum(Wood) as totalWood, Sum(Stone) as totalStone, Sum(Iron) as totalIron, Sum(Wheat) as totalWheat FROM players", function(error, res){
            if(error){
                //console.log("resource query error");
                throw error;
            }else{
                io.sockets.emit('update total resources', res);
            }
        });
    }

    function getRndInteger(min, max) {
        return Math.floor(Math.random() * (max - min) ) + min;
    }

})