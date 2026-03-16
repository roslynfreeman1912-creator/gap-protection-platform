#!/usr/bin/env python3
"""
Professional PDF Report Generator for GAP Protection
Bilingual reports (German/English) for Banking & Call Center Security Assessments
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, 
                                 TableStyle, PageBreak, Image, KeepTogether)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from datetime import datetime
import json
from pathlib import Path


class GAPProtectionReportGenerator:
    """
    Professional PDF report generator with company branding
    """
    
    def __init__(self, company_name: str = "GAP Protection GmbH", 
                 logo_path: str = None, language: str = "de"):
        self.company_name = company_name
        self.logo_path = logo_path
        self.language = language
        self.translations = self._load_translations()
        
    def _load_translations(self) -> dict:
        """Load translations for bilingual support"""
        return {
            'de': {
                'title': 'Sicherheitsbewertungsbericht',
                'subtitle': 'Professionelle Schwachstellenanalyse',
                'confidential': 'VERTRAULICH',
                'prepared_for': 'Erstellt für:',
                'prepared_by': 'Erstellt von:',
                'date': 'Datum:',
                'executive_summary': 'Zusammenfassung',
                'findings': 'Feststellungen',
                'vulnerabilities': 'Schwachstellen',
                'admin_panels': 'Admin-Panels',
                'sensitive_files': 'Sensible Dateien',
                'risk_score': 'Risikobewertung',
                'severity': 'Schweregrad',
                'critical': 'KRITISCH',
                'high': 'HOCH',
                'medium': 'MITTEL',
                'low': 'NIEDRIG',
                'cvss_score': 'CVSS-Score',
                'impact': 'Auswirkung',
                'exploitation': 'Ausnutzung',
                'remediation': 'Abhilfemaßnahmen',
                'proof': 'Nachweis',
                'url': 'URL',
                'payload': 'Payload',
                'recommendations': 'Empfehlungen',
                'immediate_actions': 'Sofortige Maßnahmen erforderlich',
                'detailed_findings': 'Detaillierte Ergebnisse',
                'vulnerability_details': 'Schwachstellen-Details',
                'total_found': 'Gesamt gefunden',
                'scan_summary': 'Scan-Zusammenfassung',
                'target': 'Ziel',
                'scan_date': 'Scan-Datum',
                'company_info': 'Firmeninformationen',
                'contact': 'Kontakt',
                'page': 'Seite',
                'of': 'von',
                'table_of_contents': 'Inhaltsverzeichnis',
                'introduction': 'Einführung',
                'methodology': 'Methodik',
                'conclusion': 'Fazit',
                'appendix': 'Anhang',
                'references': 'Referenzen'
            },
            'en': {
                'title': 'Security Assessment Report',
                'subtitle': 'Professional Vulnerability Analysis',
                'confidential': 'CONFIDENTIAL',
                'prepared_for': 'Prepared for:',
                'prepared_by': 'Prepared by:',
                'date': 'Date:',
                'executive_summary': 'Executive Summary',
                'findings': 'Findings',
                'vulnerabilities': 'Vulnerabilities',
                'admin_panels': 'Admin Panels',
                'sensitive_files': 'Sensitive Files',
                'risk_score': 'Risk Assessment',
                'severity': 'Severity',
                'critical': 'CRITICAL',
                'high': 'HIGH',
                'medium': 'MEDIUM',
                'low': 'LOW',
                'cvss_score': 'CVSS Score',
                'impact': 'Impact',
                'exploitation': 'Exploitation',
                'remediation': 'Remediation',
                'proof': 'Proof',
                'url': 'URL',
                'payload': 'Payload',
                'recommendations': 'Recommendations',
                'immediate_actions': 'Immediate Actions Required',
                'detailed_findings': 'Detailed Findings',
                'vulnerability_details': 'Vulnerability Details',
                'total_found': 'Total Found',
                'scan_summary': 'Scan Summary',
                'target': 'Target',
                'scan_date': 'Scan Date',
                'company_info': 'Company Information',
                'contact': 'Contact',
                'page': 'Page',
                'of': 'of',
                'table_of_contents': 'Table of Contents',
                'introduction': 'Introduction',
                'methodology': 'Methodology',
                'conclusion': 'Conclusion',
                'appendix': 'Appendix',
                'references': 'References'
            }
        }
    
    def t(self, key: str) -> str:
        """Translate key to current language"""
        return self.translations[self.language].get(key, key)
    
    def _create_header_footer(self, canvas_obj, doc):
        """Create professional header and footer"""
        canvas_obj.saveState()
        
        # Header
        if self.logo_path and Path(self.logo_path).exists():
            try:
                canvas_obj.drawImage(self.logo_path, 40, A4[1] - 60, 
                                    width=60, height=30, preserveAspectRatio=True)
            except:
                pass
        
        canvas_obj.setFont('Helvetica-Bold', 14)
        canvas_obj.drawString(110, A4[1] - 50, self.company_name)
        canvas_obj.setFont('Helvetica', 8)
        canvas_obj.drawString(110, A4[1] - 65, self.t('confidential'))
        
        canvas_obj.setStrokeColor(colors.HexColor('#003366'))
        canvas_obj.line(40, A4[1] - 75, A4[0] - 40, A4[1] - 75)
        
        # Footer
        canvas_obj.setStrokeColor(colors.HexColor('#003366'))
        canvas_obj.line(40, 40, A4[0] - 40, 40)
        
        canvas_obj.setFont('Helvetica', 8)
        canvas_obj.drawString(40, 25, f"© {datetime.now().year} {self.company_name}")
        
        page_num = f"{self.t('page')} {doc.page} {self.t('of')} {doc._pageNumber}"
        canvas_obj.drawRightString(A4[0] - 40, 25, page_num)
        
        canvas_obj.restoreState()
    
    def generate_report(self, scan_results: dict, output_filename: str, 
                       client_name: str = "Client"):
        """
        Generate comprehensive PDF report
        """
        doc = SimpleDocTemplate(
            output_filename,
            pagesize=A4,
            rightMargin=40,
            leftMargin=40,
            topMargin=90,
            bottomMargin=60
        )
        
        # Container for PDF elements
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#003366'),
            spaceAfter=30,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Normal'],
            fontSize=14,
            textColor=colors.HexColor('#666666'),
            spaceAfter=20,
            alignment=TA_CENTER
        )
        
        heading2_style = ParagraphStyle(
            'CustomHeading2',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#003366'),
            spaceAfter=12,
            spaceBefore=12,
            fontName='Helvetica-Bold'
        )
        
        heading3_style = ParagraphStyle(
            'CustomHeading3',
            parent=styles['Heading3'],
            fontSize=14,
            textColor=colors.HexColor('#0055AA'),
            spaceAfter=10,
            spaceBefore=10,
            fontName='Helvetica-Bold'
        )
        
        # Cover Page
        story.append(Spacer(1, 2*cm))
        
        if self.logo_path and Path(self.logo_path).exists():
            try:
                img = Image(self.logo_path, width=8*cm, height=4*cm)
                img.hAlign = 'CENTER'
                story.append(img)
                story.append(Spacer(1, 1*cm))
            except:
                pass
        
        story.append(Paragraph(self.t('title'), title_style))
        story.append(Paragraph(self.t('subtitle'), subtitle_style))
        story.append(Spacer(1, 2*cm))
        
        # Report info box
        report_info = [
            [self.t('prepared_for'), client_name],
            [self.t('prepared_by'), self.company_name],
            [self.t('date'), datetime.now().strftime('%d.%m.%Y %H:%M')],
            [self.t('target'), scan_results.get('target', 'N/A')],
            ['', '']
        ]
        
        info_table = Table(report_info, colWidths=[6*cm, 10*cm])
        info_table.setStyle(TableStyle([
            ('FONT', (0, 0), (-1, -1), 'Helvetica', 11),
            ('FONT', (0, 0), (0, -1), 'Helvetica-Bold', 11),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#003366')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ]))
        
        story.append(info_table)
        story.append(PageBreak())
        
        # Executive Summary
        story.append(Paragraph(self.t('executive_summary'), heading2_style))
        
        summary = scan_results.get('summary', {})
        risk_score = scan_results.get('risk_score', 0)
        
        if self.language == 'de':
            exec_summary_text = f"""
            Diese Sicherheitsbewertung wurde für {client_name} durchgeführt, um potenzielle 
            Sicherheitslücken zu identifizieren. Die Analyse ergab insgesamt 
            <b>{summary.get('total_vulnerabilities', 0)}</b> Schwachstellen, darunter 
            <b style="color: red;">{summary.get('critical', 0)}</b> kritische und 
            <b style="color: orange;">{summary.get('high', 0)}</b> hochgradige Sicherheitsprobleme.
            <br/><br/>
            Der Gesamtrisiko-Score beträgt <b style="color: red;">{risk_score:.1f}/10.0</b>, 
            was {"sofortige Maßnahmen erfordert" if risk_score > 7 else "Aufmerksamkeit erfordert"}.
            <br/><br/>
            Zusätzlich wurden <b>{summary.get('admin_panels', 0)}</b> öffentlich zugängliche 
            Admin-Panels und <b>{summary.get('sensitive_files', 0)}</b> sensible Dateien gefunden.
            """
        else:
            exec_summary_text = f"""
            This security assessment was conducted for {client_name} to identify potential 
            security vulnerabilities. The analysis revealed a total of 
            <b>{summary.get('total_vulnerabilities', 0)}</b> vulnerabilities, including 
            <b style="color: red;">{summary.get('critical', 0)}</b> critical and 
            <b style="color: orange;">{summary.get('high', 0)}</b> high-severity security issues.
            <br/><br/>
            The overall risk score is <b style="color: red;">{risk_score:.1f}/10.0</b>, 
            which {"requires immediate action" if risk_score > 7 else "requires attention"}.
            <br/><br/>
            Additionally, <b>{summary.get('admin_panels', 0)}</b> publicly accessible 
            admin panels and <b>{summary.get('sensitive_files', 0)}</b> sensitive files were found.
            """
        
        story.append(Paragraph(exec_summary_text, styles['Normal']))
        story.append(Spacer(1, 1*cm))
        
        # Risk Score Visualization
        story.append(Paragraph(self.t('risk_score'), heading3_style))
        
        risk_data = [
            [self.t('critical'), summary.get('critical', 0)],
            [self.t('high'), summary.get('high', 0)],
            [self.t('medium'), summary.get('medium', 0)],
            [self.t('low'), summary.get('low', 0)],
        ]
        
        risk_table = Table(risk_data, colWidths=[10*cm, 5*cm])
        risk_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#FF0000')),
            ('BACKGROUND', (0, 1), (0, 1), colors.HexColor('#FF6600')),
            ('BACKGROUND', (0, 2), (0, 2), colors.HexColor('#FFAA00')),
            ('BACKGROUND', (0, 3), (0, 3), colors.HexColor('#00AA00')),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.white),
            ('FONT', (0, 0), (-1, -1), 'Helvetica-Bold', 12),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 1, colors.white),
            ('ROWHEIGHT', (0, 0), (-1, -1), 30),
        ]))
        
        story.append(risk_table)
        story.append(PageBreak())
        
        # Detailed Vulnerabilities
        vulnerabilities = scan_results.get('vulnerabilities', [])
        
        if vulnerabilities:
            story.append(Paragraph(self.t('detailed_findings'), heading2_style))
            
            for i, vuln in enumerate(vulnerabilities, 1):
                # Vulnerability header
                vuln_title = f"{i}. {vuln.get('vuln_type', 'Unknown').upper().replace('_', ' ')}"
                story.append(Paragraph(vuln_title, heading3_style))
                
                # Severity badge
                severity = vuln.get('severity', 'MEDIUM')
                severity_color = {
                    'CRITICAL': colors.HexColor('#FF0000'),
                    'HIGH': colors.HexColor('#FF6600'),
                    'MEDIUM': colors.HexColor('#FFAA00'),
                    'LOW': colors.HexColor('#00AA00')
                }.get(severity, colors.grey)
                
                details = [
                    [self.t('severity'), Paragraph(f'<b style="color: {severity_color.hexval()};">{severity}</b>', styles['Normal'])],
                    [self.t('cvss_score'), f"{vuln.get('cvss_score', 0):.1f}"],
                    [self.t('url'), Paragraph(f'<font size="8">{vuln.get("url", "N/A")}</font>', styles['Normal'])],
                    [self.t('payload'), Paragraph(f'<font size="8" face="Courier">{vuln.get("payload", "N/A")}</font>', styles['Normal'])],
                ]
                
                details_table = Table(details, colWidths=[4*cm, 12*cm])
                details_table.setStyle(TableStyle([
                    ('FONT', (0, 0), (0, -1), 'Helvetica-Bold', 10),
                    ('FONT', (1, 0), (1, -1), 'Helvetica', 10),
                    ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#003366')),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                ]))
                
                story.append(details_table)
                story.append(Spacer(1, 0.5*cm))
                
                # Impact
                impact = vuln.get('impact', {})
                impact_text = impact.get(self.language, 'No description available')
                story.append(Paragraph(f"<b>{self.t('impact')}:</b>", styles['Normal']))
                story.append(Paragraph(impact_text, styles['Normal']))
                story.append(Spacer(1, 0.3*cm))
                
                # Proof
                proofs = vuln.get('proof', [])
                if proofs:
                    story.append(Paragraph(f"<b>{self.t('proof')}:</b>", styles['Normal']))
                    for proof in proofs:
                        story.append(Paragraph(f"• {proof}", styles['Normal']))
                    story.append(Spacer(1, 0.3*cm))
                
                # Exploitation
                exploitation = vuln.get('exploitation', {})
                exploit_text = exploitation.get(self.language, 'No description available')
                story.append(Paragraph(f"<b>{self.t('exploitation')}:</b>", styles['Normal']))
                story.append(Paragraph(exploit_text, styles['Normal']))
                story.append(Spacer(1, 0.3*cm))
                
                # Remediation
                remediation = vuln.get('remediation', {})
                remedy_text = remediation.get(self.language, 'No description available')
                story.append(Paragraph(f"<b>{self.t('remediation')}:</b>", styles['Normal']))
                story.append(Paragraph(remedy_text, styles['Normal']))
                
                story.append(Spacer(1, 0.8*cm))
                
                # Page break every 2 vulnerabilities
                if i % 2 == 0:
                    story.append(PageBreak())
        
        # Admin Panels
        admin_panels = scan_results.get('admin_panels', [])
        if admin_panels:
            story.append(PageBreak())
            story.append(Paragraph(self.t('admin_panels'), heading2_style))
            
            admin_data = [[self.t('url'), 'Status', self.t('severity')]]
            for panel in admin_panels:
                admin_data.append([
                    Paragraph(f'<font size="8">{panel.get("url", "N/A")}</font>', styles['Normal']),
                    str(panel.get('status', 'N/A')),
                    panel.get('severity', 'N/A')
                ])
            
            admin_table = Table(admin_data, colWidths=[10*cm, 3*cm, 3*cm])
            admin_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 11),
                ('FONT', (0, 1), (-1, -1), 'Helvetica', 9),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F0F0F0')]),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            
            story.append(admin_table)
        
        # Sensitive Files
        sensitive_files = scan_results.get('sensitive_files', [])
        if sensitive_files:
            story.append(PageBreak())
            story.append(Paragraph(self.t('sensitive_files'), heading2_style))
            
            files_data = [[self.t('url'), 'Size', self.t('severity')]]
            for sfile in sensitive_files:
                files_data.append([
                    Paragraph(f'<font size="8">{sfile.get("url", "N/A")}</font>', styles['Normal']),
                    f"{sfile.get('size', 0)} bytes",
                    sfile.get('severity', 'N/A')
                ])
            
            files_table = Table(files_data, colWidths=[10*cm, 3*cm, 3*cm])
            files_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#003366')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 11),
                ('FONT', (0, 1), (-1, -1), 'Helvetica', 9),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F0F0F0')]),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            
            story.append(files_table)
        
        # Recommendations
        story.append(PageBreak())
        story.append(Paragraph(self.t('recommendations'), heading2_style))
        
        if self.language == 'de':
            recommendations_text = """
            <b>Sofortige Maßnahmen:</b><br/>
            1. Alle KRITISCHEN Schwachstellen innerhalb von 24 Stunden beheben<br/>
            2. Admin-Panels durch IP-Whitelist oder VPN schützen<br/>
            3. Sensible Dateien aus dem öffentlichen Zugriff entfernen<br/>
            4. Web Application Firewall (WAF) implementieren<br/>
            5. Regelmäßige Sicherheitsscans durchführen<br/>
            <br/>
            <b>Mittelfristige Maßnahmen:</b><br/>
            1. Security Awareness Training für Entwickler<br/>
            2. Secure Development Lifecycle (SDL) etablieren<br/>
            3. Penetration Testing quartalsweise durchführen<br/>
            4. Bug Bounty Programm in Betracht ziehen<br/>
            5. Security Incident Response Plan erstellen
            """
        else:
            recommendations_text = """
            <b>Immediate Actions:</b><br/>
            1. Fix all CRITICAL vulnerabilities within 24 hours<br/>
            2. Protect admin panels with IP whitelist or VPN<br/>
            3. Remove sensitive files from public access<br/>
            4. Implement Web Application Firewall (WAF)<br/>
            5. Conduct regular security scans<br/>
            <br/>
            <b>Medium-term Actions:</b><br/>
            1. Security awareness training for developers<br/>
            2. Establish Secure Development Lifecycle (SDL)<br/>
            3. Conduct quarterly penetration testing<br/>
            4. Consider Bug Bounty program<br/>
            5. Create Security Incident Response Plan
            """
        
        story.append(Paragraph(recommendations_text, styles['Normal']))
        
        # Build PDF
        doc.build(story, onFirstPage=self._create_header_footer, 
                  onLaterPages=self._create_header_footer)
        
        print(f"[+] PDF Report generated: {output_filename}")
        print(f"[+] Language: {self.language.upper()}")
        print(f"[+] Total pages: ~{len(story) // 10}")


def generate_bilingual_reports(scan_results_file: str, client_name: str = "Client",
                               company_name: str = "GAP Protection GmbH",
                               logo_path: str = None):
    """
    Generate both German and English reports
    """
    # Load scan results
    with open(scan_results_file, 'r', encoding='utf-8') as f:
        scan_results = json.load(f)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Generate German report
    print("\n[+] Generating German report...")
    generator_de = GAPProtectionReportGenerator(
        company_name=company_name,
        logo_path=logo_path,
        language='de'
    )
    output_de = f"Security_Report_DE_{client_name.replace(' ', '_')}_{timestamp}.pdf"
    generator_de.generate_report(scan_results, output_de, client_name)
    
    # Generate English report
    print("\n[+] Generating English report...")
    generator_en = GAPProtectionReportGenerator(
        company_name=company_name,
        logo_path=logo_path,
        language='en'
    )
    output_en = f"Security_Report_EN_{client_name.replace(' ', '_')}_{timestamp}.pdf"
    generator_en.generate_report(scan_results, output_en, client_name)
    
    print("\n[✓] Bilingual reports generated successfully!")
    print(f"[✓] German: {output_de}")
    print(f"[✓] English: {output_en}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python pdf_report_generator.py <scan_results.json> <client_name> [logo_path]")
        print("Example: python pdf_report_generator.py scan_results.json 'Deutsche Bank' logo.png")
        sys.exit(1)
    
    results_file = sys.argv[1]
    client = sys.argv[2]
    logo = sys.argv[3] if len(sys.argv) > 3 else None
    
    generate_bilingual_reports(results_file, client, logo_path=logo)
