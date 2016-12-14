extern crate websocket;

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

#[derive(Copy, Clone, Eq, PartialEq, Hash, Debug)]
struct Vec3 {
    x: i32,
    y: i32,
    z: i32,
}

#[derive(Copy, Clone, Eq, PartialEq, Hash, Debug)]
struct Hex<'a> {
    id: &'a str,
    team: i32,
    tenant: i32,
    loc: Vec3,
    money: i32,
    can_move: bool,
    territory: i32,
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
    let m: i32 = computeTenantCost(Tenant::House);
    // let s:String = m.to_string();
    println!("{}", m);
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