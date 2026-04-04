import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import List "mo:core/List";
import Float "mo:core/Float";
import Array "mo:core/Array";
import Order "mo:core/Order";
import Migration "migration";

(with migration = Migration.run)
actor {
  public type ProductRow = {
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

  public type NegativeEntry = {
    entryType : Text; // "delivery" or "transfer"
    productIndex : Nat;
    cellIndex : Nat;
    quantity : Float;
    reason : Text;
  };

  public type ReportRow = {
    reportLabel : Text;
    variance : Float;
    status : Text;
  };

  public type DailySheet = {
    date : Text; // YYYY-MM-DD
    rows : [ProductRow];
    locked : Bool;
    finalizedReport : ?[ReportRow];
    negativeReasons : [(Text, Text)]; // (reason, description)
    negativeEntries : [NegativeEntry];
  };

  public type SheetKey = {
    date : Text;
  };

  public type SheetValue = {
    sheet : DailySheet;
  };

  type ProductNameKey = {
    index : Nat;
  };

  type ProductNameValue = {
    name : Text;
  };

  public type SheetEntry = {
    key : SheetKey;
    value : SheetValue;
  };

  public type ProductNameEntry = {
    key : ProductNameKey;
    value : ProductNameValue;
  };

  // Persistent storage: use Maps
  let sheetMap = Map.empty<Text, DailySheet>();
  let productNamesMap = Map.empty<Nat, ProductNameValue>();

  func compareEntries(a : SheetEntry, b : SheetEntry) : Order.Order {
    Text.compare(a.key.date, b.key.date);
  };

  // Save or update a daily sheet
  public shared ({ caller }) func saveSheet(sheet : DailySheet) : async () {
    sheetMap.add(sheet.date, sheet);
  };

  // Load a single sheet by date
  public query ({ caller }) func loadSheet(date : Text) : async ?DailySheet {
    sheetMap.get(date);
  };

  // Load all sheets
  public query ({ caller }) func loadAllSheets() : async [SheetEntry] {
    let entries = List.empty<SheetEntry>();
    for ((k, v) in sheetMap.entries()) {
      entries.add({ key = { date = k }; value = { sheet = v } });
    };

    let sortedEntries = entries.toArray().sort(compareEntries);
    sortedEntries;
  };

  // Save product names
  public shared ({ caller }) func saveProductNames(names : [Text]) : async () {
    for (i in Nat.range(0, names.size())) {
      productNamesMap.add(i, { name = names[i] });
    };
  };

  // Load product names
  public query ({ caller }) func loadProductNames() : async [ProductNameEntry] {
    let entries = List.empty<ProductNameEntry>();
    for ((k, v) in productNamesMap.entries()) {
      entries.add({ key = { index = k }; value = v });
    };

    let sortedEntries = entries.toArray();
    sortedEntries;
  };

  // Helper to get product name by index
  public query ({ caller }) func getProductName(index : Nat) : async ?Text {
    switch (productNamesMap.get(index)) {
      case (?name) { ?name.name };
      case (null) { null };
    };
  };

  // Helper to get all negative entries for a date
  public query ({ caller }) func getNegativeEntries(date : Text) : async ?[NegativeEntry] {
    switch (sheetMap.get(date)) {
      case (?sheet) { ?sheet.negativeEntries };
      case (null) { null };
    };
  };

  // Helper to lock a sheet
  public shared ({ caller }) func lockSheet(date : Text) : async Bool {
    switch (sheetMap.get(date)) {
      case (?sheet) {
        let updatedSheet = {
          sheet with
          locked = true;
        };
        sheetMap.add(date, updatedSheet);
        true;
      };
      case (null) { false };
    };
  };
};

