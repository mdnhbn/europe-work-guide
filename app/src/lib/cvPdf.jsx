import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';

const family = 'CV Noto Sans Bengali';
const fontPath = new URL(`${import.meta.env.BASE_URL}fonts/`, window.location.href);

Font.register({
  family,
  fonts: [
    { src: new URL('NotoSansBengali-Regular.ttf', fontPath).href, fontWeight: 400 },
    { src: new URL('NotoSansBengali-Bold.ttf', fontPath).href, fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: { fontFamily: family, fontSize: 11, lineHeight: 1.45, padding: 42, color: '#1b2924' },
  compact: { fontSize: 10, padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 2, borderBottomColor: '#1e6048', paddingBottom: 14 },
  headerText: { flex: 1 },
  subtitle: { color: '#527064', marginBottom: 4 },
  name: { fontSize: 23, fontWeight: 700 },
  contact: { color: '#61726b', marginTop: 4 },
  photo: { width: 70, height: 84, borderWidth: 1, borderStyle: 'dashed', borderColor: '#a8b6ae', alignItems: 'center', justifyContent: 'center' },
  photoLabel: { textAlign: 'center', color: '#527064' },
  section: { marginTop: 11, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5ebe7' },
  compactSection: { marginTop: 6, paddingBottom: 4 },
  sectionTitle: { color: '#1e6048', fontSize: 13, fontWeight: 700, marginBottom: 4 },
  entry: { marginBottom: 4 },
  entryHeading: { fontWeight: 700 },
  details: { color: '#61726b' },
});

function CvPdfDocument({ cv }) {
  return (
    <Document title={cv.name + ' · জীবনবৃত্তান্ত'} language="bn">
      <Page size="A4" style={cv.compact ? [styles.page, styles.compact] : styles.page}>
        <View style={styles.header}>
          {cv.photoPlaceholder && <View style={styles.photo}><Text style={styles.photoLabel}>{'ছবির\nজায়গা'}</Text></View>}
          <View style={styles.headerText}>
            <Text style={styles.subtitle}>{cv.subtitle}</Text>
            <Text style={styles.name}>{cv.name}</Text>
            <Text style={styles.contact}>{cv.contact}</Text>
          </View>
        </View>
        {cv.sections.map(({ title, entries }) => (
          <View key={title} style={cv.compact ? [styles.section, styles.compactSection] : styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={20}>{title}</Text>
            {entries.map(({ heading, details, text }, index) => (
              <View key={index} style={styles.entry}>
                {heading && <Text style={styles.entryHeading} minPresenceAhead={details || text ? 15 : 0}>{heading}</Text>}
                {details && <Text style={styles.details}>{details}</Text>}
                {text && <Text>{text}</Text>}
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function downloadCvPdf(cv) {
  const blob = await pdf(<CvPdfDocument cv={cv} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'europe-work-guide-cv.pdf';
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give browsers time to start reading the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
