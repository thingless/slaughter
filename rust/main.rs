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

struct Hex {

}

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
