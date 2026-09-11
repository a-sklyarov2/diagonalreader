/// Compression levels for page summaries.
///
/// "Nx" thinking: the summary targets roughly 1/Nth of the page text,
/// with [max] being the extreme — the whole page in a single sentence.
enum SummaryLevel { low, mid, high, max }

extension SummaryLevelX on SummaryLevel {
  String get label => switch (this) {
        SummaryLevel.low => 'Low',
        SummaryLevel.mid => 'Mid',
        SummaryLevel.high => 'High',
        SummaryLevel.max => 'Max',
      };

  /// Target-length instruction embedded in the model prompt.
  String get target => switch (this) {
        SummaryLevel.low => 'about half the length of the original text',
        SummaryLevel.mid => 'about a quarter of the length of the original text',
        SummaryLevel.high => 'a few sentences capturing only the key points',
        SummaryLevel.max =>
          'a single sentence capturing the single most important point of the page',
      };

  int get maxTokens => switch (this) {
        SummaryLevel.low => 1500,
        SummaryLevel.mid => 800,
        SummaryLevel.high => 400,
        SummaryLevel.max => 150,
      };
}
