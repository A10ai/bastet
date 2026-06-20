export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy — HospitAI",
  description: "How HospitAI collects, uses, and protects guest data under UK GDPR",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bastet-bg p-6 md:p-12">
      <div className="max-w-3xl mx-auto prose prose-invert">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Privacy Policy</h1>

        <p className="text-sm text-text-secondary mb-4">
          Last updated: {new Date().toISOString().split("T")[0]}
        </p>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">1. Data Controller</h2>
        <p className="text-sm text-text-secondary mb-4">
          HospitAI is the data controller for personal data processed through this platform.
          For data protection inquiries, contact: privacy@hospitai.uk
        </p>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">2. Data We Collect</h2>
        <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside mb-4">
          <li><strong>Guest data:</strong> Name, email, phone, passport number, nationality, booking history, preferences</li>
          <li><strong>Staff data:</strong> Name, email, role, work schedule, activity logs</li>
          <li><strong>Operational data:</strong> Bookings, payments, invoices, maintenance requests, housekeeping tasks</li>
          <li><strong>Analytics data:</strong> Occupancy rates, revenue figures, property performance metrics (aggregated, no PII)</li>
        </ul>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">3. Legal Basis (UK GDPR Article 6)</h2>
        <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside mb-4">
          <li><strong>Contract performance:</strong> Processing necessary for hotel bookings and service delivery</li>
          <li><strong>Legal obligation:</strong> Financial records retention per HMRC requirements</li>
          <li><strong>Legitimate interest:</strong> Property operations, security, fraud prevention</li>
          <li><strong>Consent:</strong> Marketing communications, analytics, profiling (opt-in, withdrawable)</li>
        </ul>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">4. Your Rights (UK GDPR)</h2>
        <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside mb-4">
          <li><strong>Right of access (Article 15):</strong> Request a copy of your data via the GDPR export API</li>
          <li><strong>Right to rectification (Article 16):</strong> Request correction of inaccurate data</li>
          <li><strong>Right to erasure (Article 17):</strong> Request deletion of your personal data</li>
          <li><strong>Right to data portability (Article 20):</strong> Receive your data in a structured format</li>
          <li><strong>Right to object (Article 21):</strong> Object to processing based on legitimate interests</li>
          <li><strong>Right to withdraw consent:</strong> Withdraw consent at any time for consent-based processing</li>
        </ul>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">5. Data Retention</h2>
        <ul className="text-sm text-text-secondary space-y-2 list-disc list-inside mb-4">
          <li>Guest PII: Retained for duration of relationship + 6 years (financial/legal requirements)</li>
          <li>Financial records (invoices, payments): 6 years per HMRC requirements</li>
          <li>Marketing consent: Until withdrawn</li>
          <li>Erasure requests: PII anonymized, financial records retained per law</li>
        </ul>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">6. AI Processing</h2>
        <p className="text-sm text-text-secondary mb-4">
          Guest data sent to AI systems (Claude API or local LLM) is anonymized before processing.
          No guest PII (names, emails, phone numbers, passport numbers) is sent to external AI providers.
          Only aggregated operational metrics and anonymized patterns are used for AI analysis.
        </p>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">7. International Transfers</h2>
        <p className="text-sm text-text-secondary mb-4">
          Data is stored in the UK (Supabase) and EU (Vercel). AI processing may occur in the US (Anthropic)
          but only with anonymized data. No PII is transferred outside the UK/EU.
        </p>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">8. Cookies</h2>
        <p className="text-sm text-text-secondary mb-4">
          We use essential cookies for authentication and session management.
          Analytics and marketing cookies are optional and require your consent.
          You can manage cookie preferences in the cookie consent banner.
        </p>

        <h2 className="text-lg font-semibold text-text-primary mt-6 mb-3">9. Contact</h2>
        <p className="text-sm text-text-secondary mb-4">
          For GDPR requests or privacy concerns: privacy@hospitai.uk<br />
          ICO registration number: [to be added upon registration]
        </p>
      </div>
    </div>
  );
}