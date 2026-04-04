import Map "mo:core/Map";
import Nat "mo:core/Nat";
import List "mo:core/List";
import Order "mo:core/Order";
import Text "mo:core/Text";
import Array "mo:core/Array";

module {
  // Old types
  type OldProduct = {
    id : Nat;
    name : Text;
    unit : Text;
  };

  type OldStockEntry = {
    productId : Nat;
    openingStock : Float;
    receivedQty : Float;
    soldQty : Float;
    actualClosing : Float;
  };

  type OldSession = {
    sessionType : Text; // "AM" or "PM"
    entries : [OldStockEntry];
    savedAt : Int;
  };

  type OldDailySheet = {
    date : Text; // YYYYMMDD
    sessions : [OldSession];
    isClosed : Bool;
    closedAt : ?Int;
  };

  type OldActor = {
    productList : List.List<OldProduct>;
    dailySheets : Map.Map<Text, OldDailySheet>;
  };

  type OldProductRow = {
    productName : Text;
    opening : Float;
    delivery : Float;
    deliveryCells : [Float];
    transfer : Float;
    transferCells : [Float];
    openCounter : Float;
    physical : Float;
    additional : Float;
    posCount : Float;
  };

  type NegativeEntry = {
    entryType : Text; // "delivery" or "transfer"
    productIndex : Nat;
    cellIndex : Nat;
    quantity : Float;
    reason : Text;
  };

  type ReportRow = {
    reportLabel : Text;
    variance : Float;
    status : Text;
  };

  type NewDailySheet = {
    date : Text; // YYYY-MM-DD
    rows : [OldProductRow];
    locked : Bool;
    finalizedReport : ?[ReportRow];
    negativeReasons : [(Text, Text)]; // (reason, description)
    negativeEntries : [NegativeEntry];
  };

  type NewActor = {
    sheetMap : Map.Map<Text, NewDailySheet>;
    productNamesMap : Map.Map<Nat, { name : Text }>;
  };

  // Helper to create default product names
  func defaultProductNames() : [(Nat, { name : Text })] {
    [
      (0, { name = "Product 1" }),
      (1, { name = "Product 2" }),
      (2, { name = "Product 3" }),
      (3, { name = "Product 4" }),
      (4, { name = "Product 5" }),
      (5, { name = "Product 6" }),
      (6, { name = "Product 7" }),
      (7, { name = "Product 8" }),
      (8, { name = "Product 9" }),
      (9, { name = "Product 10" }),
      (10, { name = "Product 11" }),
      (11, { name = "Product 12" }),
      (12, { name = "Product 13" }),
      (13, { name = "Product 14" }),
      (14, { name = "Product 15" }),
      (15, { name = "Product 16" }),
      (16, { name = "Product 17" }),
      (17, { name = "Product 18" }),
      (18, { name = "Product 19" }),
      (19, { name = "Product 20" }),
      (20, { name = "Product 21" }),
      (21, { name = "Product 22" }),
    ];
  };

  // Migration function
  public func run(old : OldActor) : NewActor {
    let sheetMap = Map.empty<Text, NewDailySheet>();
    let productNamesMap = Map.fromIter<Nat, { name : Text }>(defaultProductNames().values());

    { sheetMap; productNamesMap };
  };
};

