extern crate websocket;

use std::collections::HashMap;

// struct Hex {
// team:u16,
//
// }
//
// fn allNeighbors(hex:&Hex) -> Vec<Hex>{
//
// }
//
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
enum Tenant {
    House = 1,
    Tower = 2,

    Grave = 3,
    TreePalm = 4,
    TreePine = 5,

    Peasant = 6,
    Spearman = 7,
    Knight = 8,
    Paladan = 9,
}

#[derive(Default, Copy, Clone, Eq, PartialEq, Hash, Debug)]
struct Vec3 {
    x: i32,
    y: i32,
    z: i32,
}

#[derive(Default, Copy, Clone, Eq, PartialEq, Hash, Debug)]
struct Hex<'a> {
    id: &'a str,
    team: i32,
    tenant: i32,
    loc: Vec3,
    money: i32,
    can_move: bool,
    territory: i32,
}

struct Board<'a> {
    map: HashMap<&'a str, &'a Hex<'a>>,
}

trait BoardTrait {
    fn all_neighbors(&self, &Hex) -> [Hex; 6];
}

impl<'a> BoardTrait for Board<'a> {
    fn all_neighbors(&self, hex:&Hex) -> [Hex; 6] {
        let mut out = [Default::default(); 6];
        //out[0] = Hex { id:"a", team:0, tenant:0, loc:Vec3 {x:0, y:0, z:0}, money:0, can_move:false, territory:0 };
        return out;
    }
}

//fn all_neighbors(hex:&Hex) -> [&Hex; 6] {
//    let mut out: [&Hex; 6];
//    out[0] = Hex {};
//    out[1] = Hex {};
//    out[2] = Hex {};
//    out[3] = Hex {};
//    out[4] = Hex {};
//    out[5] = Hex {};
//    return out;
//}

fn computeTenantCost(tenant: Tenant) -> i32 {
    if tenant == Tenant::House {
        return 10;
    }
    return 0;
}

fn main() {
    let board = Board { map: HashMap::new() };
    let cool_hex : Hex = Default::default();
    let neighs: [Hex; 6] = board.all_neighbors(&cool_hex);
    for &hex in neighs.iter() {
        println!("{:?}", hex);
    }
}


/*
    let url = Url::parse("ws://127.0.0.1:8080/ws").unwrap();
    println!("Connecting to {}", url);
    let request = Client::connect().unwrap(); // Send the request and retrieve a response
    let response = request.send().unwrap(); // Send the request and retrieve a response
    println!("Validating response...");
    response.validate().unwrap(); // Validate the response
    println!("Successfully connected");
    let (mut sender, mut receiver) = response.begin().split();
*/