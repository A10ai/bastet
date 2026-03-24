#!/usr/bin/env python3
"""Generate IT Firewall Requirements PDF document."""

from fpdf import FPDF

OUTPUT_PATH = "/Users/ai10/bastet/docs/IT-Firewall-Requirements.pdf"

# Colors
DARK_BLUE = (26, 54, 93)       # #1a365d
MEDIUM_BLUE = (44, 82, 130)    # #2c5282
LIGHT_BLUE_BG = (235, 243, 254) # #ebf3fe
WHITE = (255, 255, 255)
BLACK = (33, 33, 33)
GRAY = (100, 100, 100)
LIGHT_GRAY = (220, 220, 220)
DIVIDER_BLUE = (66, 133, 244)


class FirewallPDF(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=25)

    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(*GRAY)
            self.cell(0, 6, "IT Firewall & Network Requirements - HospitAI & Wedja", align="L")
            self.cell(0, 6, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
            self.set_draw_color(*LIGHT_GRAY)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(4)

    def footer(self):
        self.set_y(-18)
        self.set_draw_color(*LIGHT_GRAY)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)
        self.set_font("Helvetica", "I", 7.5)
        self.set_text_color(*GRAY)
        self.cell(0, 5, "Confidential - Internal Use Only", align="L")
        self.cell(0, 5, f"Page {self.page_no()}", align="R")

    def section_divider(self):
        """Draw a thin blue horizontal rule."""
        self.ln(2)
        self.set_draw_color(*DIVIDER_BLUE)
        self.set_line_width(0.4)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.set_line_width(0.2)
        self.ln(4)

    def section_heading(self, number, title):
        self.section_divider()
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*DARK_BLUE)
        self.cell(0, 8, f"Section {number}: {title}", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text, bold=False):
        style = "B" if bold else ""
        self.set_font("Helvetica", style, 10)
        self.set_text_color(*BLACK)
        self.multi_cell(0, 5.5, text, new_x="LMARGIN", new_y="NEXT")

    def domain_table(self, rows):
        """Render a domain whitelist table."""
        col_domain = 85
        col_purpose = self.w - self.l_margin - self.r_margin - col_domain
        row_h = 7.5

        # Table header
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(*DARK_BLUE)
        self.set_text_color(*WHITE)
        self.cell(col_domain, row_h, "  Domain", border=1, fill=True)
        self.cell(col_purpose, row_h, "  Purpose", border=1, fill=True, new_x="LMARGIN", new_y="NEXT")

        # Table rows
        self.set_font("Courier", "", 9)
        for i, (domain, purpose) in enumerate(rows):
            if i % 2 == 0:
                self.set_fill_color(*LIGHT_BLUE_BG)
            else:
                self.set_fill_color(*WHITE)

            self.set_text_color(*BLACK)
            self.cell(col_domain, row_h, f"  {domain}", border="LBR", fill=True)
            self.set_font("Helvetica", "", 9)
            self.cell(col_purpose, row_h, f"  {purpose}", border="BR", fill=True, new_x="LMARGIN", new_y="NEXT")
            self.set_font("Courier", "", 9)

        self.ln(3)

    def bullet(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*BLACK)
        x = self.get_x()
        self.cell(6, 5.5, "-")
        self.multi_cell(self.w - self.l_margin - self.r_margin - 6, 5.5, text, new_x="LMARGIN", new_y="NEXT")

    def numbered_item(self, number, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*BLACK)
        self.cell(7, 5.5, f"{number}.")
        self.multi_cell(self.w - self.l_margin - self.r_margin - 7, 5.5, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)


def build_pdf():
    pdf = FirewallPDF()
    pdf.set_margin(20)
    pdf.add_page()

    # --- Title block ---
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(0, 11, "IT Firewall & Network Requirements", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MEDIUM_BLUE)
    pdf.cell(0, 7, "HospitAI & Wedja AI Platforms - Senzo Mall, Hurghada", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 6, "23 March 2026", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Decorative line under title block
    pdf.set_draw_color(*DARK_BLUE)
    pdf.set_line_width(0.8)
    cx = pdf.w / 2
    pdf.line(cx - 40, pdf.get_y(), cx + 40, pdf.get_y())
    pdf.set_line_width(0.2)
    pdf.ln(6)

    # --- To / From ---
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(12, 6, "To:")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 6, "IT Team & FC (Ayman)", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(12, 6, "From:")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 6, "Management", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(12, 6, "Re:")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 6, "IT Firewall Requirements - HospitAI & Wedja", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # --- Introduction ---
    pdf.body_text(
        "This document outlines the network/firewall configuration required for two AI "
        "platforms used at our properties. Both platforms are cloud-hosted and require "
        "HTTPS (port 443) access only. Please whitelist the following domains and exclude "
        "them from SSL inspection if enabled."
    )
    pdf.ln(2)

    # --- Section 1: HospitAI ---
    pdf.section_heading("1", "HospitAI - AI Hotel Operating System")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(20, 6, "Platform:")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 6, "app.hospitai.uk", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(20, 6, "Purpose:")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 6, "AI-powered hotel management for Bastet Hurghada (270-unit aparthotel)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(0, 6, "Domains to Whitelist:", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    pdf.domain_table([
        ("app.hospitai.uk", "Main application"),
        ("hospitai.vercel.app", "Hosting (fallback)"),
        ("*.vercel.app", "Vercel CDN & assets"),
        ("zzsbzquibzqznmudnute.supabase.co", "Database & authentication"),
        ("*.supabase.co", "Realtime websockets (WSS)"),
        ("api.anthropic.com", "AI Brain (Claude API)"),
        ("fonts.googleapis.com", "Google Fonts"),
        ("fonts.gstatic.com", "Font files"),
    ])

    # --- Section 2: Wedja ---
    pdf.section_heading("2", "Wedja - AI Property Management Platform")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(20, 6, "Platform:")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 6, "app.wedja.ai", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(20, 6, "Purpose:")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 6, "AI-powered property management for Senzo Mall (170,000 sqm, 166 tenants)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*DARK_BLUE)
    pdf.cell(0, 6, "Domains to Whitelist:", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    pdf.domain_table([
        ("app.wedja.ai", "Main application"),
        ("wedja.vercel.app", "Hosting (fallback)"),
        ("*.vercel.app", "Vercel CDN & assets"),
        ("zzsbzquibzqznmudnute.supabase.co", "Database & authentication"),
        ("*.supabase.co", "Realtime websockets (WSS)"),
        ("api.anthropic.com", "AI Brain (Claude API)"),
        ("fonts.googleapis.com", "Google Fonts"),
        ("fonts.gstatic.com", "Font files"),
    ])

    # --- Section 3: Technical Notes ---
    pdf.section_heading("3", "Technical Notes")

    notes = [
        "All traffic is encrypted HTTPS (port 443) only",
        "WebSocket Secure (WSS) connections are used for real-time data",
        "If SSL/TLS inspection is enabled on the firewall, these domains MUST be excluded from inspection - otherwise the apps will fail to connect",
        "No inbound ports need to be opened - all connections are outbound",
        "If *.vercel.app and *.supabase.co are whitelisted, both platforms will work",
    ]
    for note in notes:
        pdf.bullet(note)
        pdf.ln(1)

    # --- Section 4: Action Required ---
    pdf.section_heading("4", "Action Required")

    # IT Team subsection
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*MEDIUM_BLUE)
    pdf.cell(0, 7, "For IT Team:", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    it_items = [
        "Whitelist all domains listed above on the corporate firewall",
        "Exclude listed domains from SSL inspection",
        "Confirm access from office PCs and mall network",
        "Test by visiting app.hospitai.uk and app.wedja.ai from a mall-connected device",
    ]
    for i, item in enumerate(it_items, 1):
        pdf.numbered_item(i, item)

    pdf.ln(3)

    # FC (Ayman) subsection
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*MEDIUM_BLUE)
    pdf.cell(0, 7, "For FC (Ayman):", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)

    fc_items = [
        "After IT confirms whitelist is applied, test both apps from your office PC",
        "Report any connection issues (timeout, SSL errors, blank page)",
        "Confirm you can log in and see the dashboard",
    ]
    for i, item in enumerate(fc_items, 1):
        pdf.numbered_item(i, item)

    # Save
    pdf.output(OUTPUT_PATH)
    print(f"PDF generated: {OUTPUT_PATH}")


if __name__ == "__main__":
    build_pdf()
