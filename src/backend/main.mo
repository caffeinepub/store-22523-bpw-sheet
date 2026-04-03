import Map "mo:core/Map";
import Text "mo:core/Text";
import Nat "mo:core/Nat";
import Order "mo:core/Order";
import Array "mo:core/Array";
import Time "mo:core/Time";
import Float "mo:core/Float";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";
import Int "mo:core/Int";
import List "mo:core/List";

actor {
  // Data types
  type Product = {
    id : Nat;
    name : Text;
    unit : Text;
  };

  type StockEntry = {
    productId : Nat;
    openingStock : Float;
    receivedQty : Float;
    soldQty : Float;
    actualClosing : Float;
  };

  type Session = {
    sessionType : Text; // "AM" or "PM"
    entries : [StockEntry];
    savedAt : Int;
  };

  type DailySheet = {
    date : Text; // YYYYMMDD
    sessions : [Session];
    isClosed : Bool;
    closedAt : ?Int;
  };

  // Persistent state
  let productList = List.empty<Product>();
  let dailySheets = Map.empty<Text, DailySheet>();

  // Utility functions
  module Helpers {
    public func compareProductsById(a : Product, b : Product) : Order.Order {
      Nat.compare(a.id, b.id);
    };

    public func compareDailySheetByDateAsc(a : DailySheet, b : DailySheet) : Order.Order {
      Text.compare(a.date, b.date);
    };

    public func compareDailySheetByDateDesc(a : DailySheet, b : DailySheet) : Order.Order {
      Text.compare(b.date, a.date);
    };

    public func compareStockEntryByProductId(a : StockEntry, b : StockEntry) : Order.Order {
      Nat.compare(a.productId, b.productId);
    };
  };

  // Initialize products if not present
  public shared ({ caller }) func initializeProducts() : async () {
    if (productList.isEmpty()) {
      let defaultProducts : [Product] = [
        { id = 1; name = "Bun"; unit = "piece" },
        { id = 2; name = "Bread Loaf"; unit = "loaf" },
        { id = 3; name = "Croissant"; unit = "piece" },
        { id = 4; name = "Cake"; unit = "kg" },
        { id = 5; name = "Donut"; unit = "piece" },
        { id = 6; name = "Muffin"; unit = "piece" },
        { id = 7; name = "Roll"; unit = "piece" },
        { id = 8; name = "Bread Slice"; unit = "pack" },
        { id = 9; name = "Cupcake"; unit = "piece" },
        { id = 10; name = "Baguette"; unit = "stick" },
      ];
      for (p in defaultProducts.values()) {
        productList.add(p);
      };
    };
  };

  // Save or update a session
  public shared ({ caller }) func saveSession(date : Text, session : Session) : async () {
    let merged : DailySheet = switch (dailySheets.get(date)) {
      case (null) {
        {
          date;
          sessions = [session];
          isClosed = false;
          closedAt = null;
        };
      };
      case (?existing) {
        if (existing.isClosed) {
          Runtime.trap("Cannot edit a closed sheet");
        };
        let filteredSessions = existing.sessions.filter(
          func(s) { not Text.equal(s.sessionType, session.sessionType) }
        );
        {
          existing with
          sessions = filteredSessions.concat([session]);
        };
      };
    };

    dailySheets.add(date, merged);
  };

  // Close/daily sheet
  public shared ({ caller }) func closeDay(date : Text) : async () {
    let now = Time.now();
    let closedSheet = switch (dailySheets.get(date)) {
      case (null) { Runtime.trap("Sheet does not exist") };
      case (?d) {
        if (d.isClosed) {
          Runtime.trap("Sheet already closed");
        };
        {
          d with
          isClosed = true;
          closedAt = ?now;
        };
      };
    };
    dailySheets.add(date, closedSheet);
  };

  // Get daily sheet by date
  public query ({ caller }) func getDailySheet(date : Text) : async ?DailySheet {
    dailySheets.get(date);
  };

  // Get all closed dates
  public query ({ caller }) func getClosedDates() : async [Text] {
    dailySheets.values().toArray().filter(
      func(s) { s.isClosed }
    ).map(func(s) { s.date });
  };

  // Get opening stock for new day
  public query ({ caller }) func getOpeningStockForNewDay(date : Text) : async [StockEntry] {
    let sortedClaySheetArray = dailySheets.values().toArray().map(
      func(ds) { ds }
    ).sort(Helpers.compareDailySheetByDateDesc);

    for (ds in sortedClaySheetArray.values()) {
      if (ds.isClosed and not Text.equal(ds.date, date)) {
        let lastSession = ds.sessions.reverse()[0];
        return lastSession.entries.sort(Helpers.compareStockEntryByProductId);
      };
    };

    // No prior closed day, default to zero opening stock for all products
    productList.toArray().map(
      func(p) {
        {
          productId = p.id;
          openingStock = 0.0;
          receivedQty = 0.0;
          soldQty = 0.0;
          actualClosing = 0.0;
        };
      }
    );
  };

  // Get product list
  public query ({ caller }) func getProducts() : async [Product] {
    productList.toArray().sort(Helpers.compareProductsById);
  };

  // Get all days by isClosed status
  public query ({ caller }) func getDaysByStatus(isClosed : Bool) : async [Text] {
    dailySheets.values().toArray().filter(
      func(s) { s.isClosed == isClosed }
    ).map(func(s) { s.date });
  };

  // get all stock for a given day
  public query ({ caller }) func getAllStockForDay(date : Text) : async [StockEntry] {
    switch (dailySheets.get(date)) {
      case (null) { [] };
      case (?d) {
        let stock = List.empty<StockEntry>();
        for (session in d.sessions.values()) {
          for (entry in session.entries.values()) {
            stock.add(entry);
          };
        };
        stock.toArray();
      };
    };
  };

  // Get diff for day
  public query ({ caller }) func getDiffForDay(date : Text) : async [StockEntry] {
    switch (dailySheets.get(date)) {
      case (null) { [] };
      case (?d) {
        let diff = List.empty<StockEntry>();
        for (session in d.sessions.values()) {
          for (entry in session.entries.values()) {
            let calculatedClosing = entry.openingStock + entry.receivedQty - entry.soldQty;
            let difference = calculatedClosing - entry.actualClosing;
            diff.add({ entry with actualClosing = difference });
          };
        };
        diff.toArray();
      };
    };
  };
};
