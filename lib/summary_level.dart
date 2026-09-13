/// Compression levels for page summaries.
///
/// Low ≈ half the page, High ≈ key points, Max = the whole page in
/// a single sentence.
enum SummaryLevel { low, high, max }

extension SummaryLevelX on SummaryLevel {
  String get label => switch (this) {
        SummaryLevel.low => 'Low',
        SummaryLevel.high => 'High',
        SummaryLevel.max => 'Max',
      };

  /// Target-length instruction embedded in the model prompt.
  String get target => switch (this) {
        SummaryLevel.low => 'about half the length of the original text',
        SummaryLevel.high => 'a few sentences capturing only the key points',
        SummaryLevel.max =>
          'a single sentence capturing the single most important point of the page',
      };

  int get maxTokens => switch (this) {
        // Generous headroom: reasoning models spend completion budget
        // on invisible thinking before answering.
        SummaryLevel.low => 3000,
        SummaryLevel.high => 1500,
        SummaryLevel.max => 1000,
      };
}
