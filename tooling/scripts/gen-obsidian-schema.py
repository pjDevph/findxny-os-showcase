import json, re, collections, os, hashlib

COLS_TSV = "/tmp/schema_columns.tsv"
FKS_TSV = "/tmp/schema_fks.tsv"
OUT_DIR = "/Users/princejohngandollas/Documents/FINDXNY OS/FINDXNY-OS/docs/schema-vault"

DOMAINS = [
    ("Workspace & Access", ["workspaces","branches","profiles","workspace_members","workspace_printers","pos_devices","auth_attempts","rate_limit_buckets","audit_logs","idempotency_keys"]),
    ("Catalog & Inventory", ["products","product_variants","product_categories","product_addons","product_addon_groups","inventory_catalog","inventory_items","suppliers","recipe_items","cost_items","stock_movements","ingredient_movements_legacy"]),
    ("Orders & Kitchen", ["orders","order_items","order_item_addons","order_charges","order_booking_link","custom_charge_presets","kitchen_tickets","kitchen_ticket_items","receipts"]),
    ("Payments & Transactions", ["payments","payment_intents","transactions","refunds","booking_payment_transactions"]),
    ("Bookings & Resources", ["bookings","bookable_resources","resource_blocks"]),
    ("Shifts & Cash Management", ["shifts","shift_events","cash_drawer_events","z_reports","manager_approvals"]),
    ("Customers & Loyalty", ["customers","customer_points","vouchers","voucher_redemptions","loyalty_rules"]),
    ("Tasks & Checklists", ["task_checklists","checklist_items","checklist_completions"]),
    ("Menu Book", ["menu_book_pages","menu_book_hotspots"]),
    ("Expenses", ["expenses","expense_categories"]),
]
TABLE_TO_DOMAIN = {}
for domain, tables in DOMAINS:
    for t in tables:
        TABLE_TO_DOMAIN[t] = domain

DOMAIN_COLORS = {
    "Workspace & Access": "1",
    "Catalog & Inventory": "2",
    "Orders & Kitchen": "3",
    "Payments & Transactions": "4",
    "Bookings & Resources": "5",
    "Shifts & Cash Management": "6",
    "Customers & Loyalty": "1",
    "Tasks & Checklists": "2",
    "Menu Book": "5",
    "Expenses": "6",
}

def load_columns():
    tables = collections.OrderedDict()
    with open(COLS_TSV) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split("\t")
            table, col, dtype, nullable, is_pk = (parts + [""] * 5)[:5]
            tables.setdefault(table, []).append({
                "name": col, "type": dtype, "nullable": nullable == "YES", "pk": is_pk == "t"
            })
    return tables

def load_fks():
    fks = []
    with open(FKS_TSV) as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            from_table, from_col, to_table, to_col = line.split("\t")
            fks.append((from_table, from_col, to_table, to_col))
    return fks

def slugify(name):
    return name

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    tables = load_columns()
    fks = load_fks()

    outgoing = collections.defaultdict(list)
    incoming = collections.defaultdict(list)
    for ft, fc, tt, tc in fks:
        outgoing[ft].append((fc, tt, tc))
        incoming[tt].append((tc, ft, fc))

    for table in sorted(tables):
        domain = TABLE_TO_DOMAIN.get(table, "Other")
        cols = tables[table]
        lines = []
        lines.append("---")
        lines.append(f"table: {table}")
        lines.append(f"domain: {domain}")
        lines.append("tags: [schema]")
        lines.append("---")
        lines.append("")
        lines.append(f"# {table}")
        lines.append("")
        lines.append(f"Domain: [[{domain}]]")
        lines.append("")
        lines.append("## Columns")
        lines.append("")
        lines.append("| Column | Type | Nullable | PK |")
        lines.append("|---|---|---|---|")
        for c in cols:
            pk = "🔑" if c["pk"] else ""
            null = "" if c["nullable"] else "NOT NULL"
            lines.append(f"| {c['name']} | {c['type']} | {null} | {pk} |")
        lines.append("")
        if outgoing[table]:
            lines.append("## References (outgoing FKs)")
            lines.append("")
            for fc, tt, tc in sorted(outgoing[table]):
                lines.append(f"- `{fc}` → [[{tt}]].`{tc}`")
            lines.append("")
        if incoming[table]:
            lines.append("## Referenced by (incoming FKs)")
            lines.append("")
            for tc, ft, fc in sorted(incoming[table]):
                lines.append(f"- [[{ft}]].`{fc}` → `{tc}`")
            lines.append("")
        with open(os.path.join(OUT_DIR, f"{table}.md"), "w") as out:
            out.write("\n".join(lines))

    # Domain index notes
    for domain, dtables in DOMAINS:
        lines = [f"# {domain}", "", "## Tables", ""]
        for t in sorted(dtables):
            if t in tables:
                lines.append(f"- [[{t}]]")
        with open(os.path.join(OUT_DIR, f"{domain}.md"), "w") as out:
            out.write("\n".join(lines))

    # Canvas: grid layout grouped by domain, edges = FKs
    NODE_W, NODE_H = 260, 90
    COL_GAP, ROW_GAP = 40, 30
    DOMAIN_GAP_Y = 160
    MAX_COLS = 4

    nodes = []
    node_id_by_table = {}
    y_cursor = 0
    domain_group_nodes = []

    for domain, dtables in DOMAINS:
        present = [t for t in sorted(dtables) if t in tables]
        if not present:
            continue
        cols_count = min(MAX_COLS, len(present))
        rows_count = (len(present) + cols_count - 1) // cols_count
        group_w = cols_count * (NODE_W + COL_GAP) + COL_GAP
        group_h = rows_count * (NODE_H + ROW_GAP) + ROW_GAP + 40
        group_id = "group_" + re.sub(r"[^a-zA-Z0-9]+", "_", domain)
        domain_group_nodes.append({
            "id": group_id, "type": "group", "x": 0, "y": y_cursor,
            "width": group_w, "height": group_h, "label": domain,
            "color": DOMAIN_COLORS.get(domain, "0")
        })
        for i, t in enumerate(present):
            r, c = divmod(i, cols_count)
            nid = "n_" + t
            node_id_by_table[t] = nid
            nodes.append({
                "id": nid, "type": "file", "file": f"{t}.md",
                "x": COL_GAP + c * (NODE_W + COL_GAP),
                "y": y_cursor + 40 + r * (NODE_H + ROW_GAP),
                "width": NODE_W, "height": NODE_H,
                "color": DOMAIN_COLORS.get(domain, "0")
            })
        y_cursor += group_h + DOMAIN_GAP_Y

    # Any tables not in a domain (shouldn't happen, but just in case)
    other = [t for t in tables if t not in node_id_by_table]
    if other:
        cols_count = min(MAX_COLS, len(other))
        for i, t in enumerate(sorted(other)):
            r, c = divmod(i, cols_count)
            nid = "n_" + t
            node_id_by_table[t] = nid
            nodes.append({
                "id": nid, "type": "file", "file": f"{t}.md",
                "x": COL_GAP + c * (NODE_W + COL_GAP),
                "y": y_cursor + 40 + r * (NODE_H + ROW_GAP),
                "width": NODE_W, "height": NODE_H, "color": "0"
            })

    edges = []
    seen_pairs = set()
    for ft, fc, tt, tc in fks:
        if ft not in node_id_by_table or tt not in node_id_by_table:
            continue
        key = (ft, tt)
        eid = "e_" + hashlib.md5(f"{ft}.{fc}->{tt}.{tc}".encode()).hexdigest()[:10]
        edges.append({
            "id": eid,
            "fromNode": node_id_by_table[ft],
            "fromSide": "bottom",
            "toNode": node_id_by_table[tt],
            "toSide": "top",
            "label": fc if ft != tt else f"{fc} (self)"
        })

    canvas = {"nodes": domain_group_nodes + nodes, "edges": edges}
    with open(os.path.join(OUT_DIR, "Schema.canvas"), "w") as out:
        json.dump(canvas, out, indent=2)

    print(f"Wrote {len(tables)} table notes, {len(DOMAINS)} domain notes, "
          f"canvas with {len(nodes)} nodes / {len(edges)} edges to {OUT_DIR}")

if __name__ == "__main__":
    main()
