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
        // Generous headroom: reasoning models spend completion budget
        // on invisible thinking before answering.
        SummaryLevel.low => 3000,
        SummaryLevel.mid => 2000,
        SummaryLevel.high => 1000,
        SummaryLevel.max => 500,
      };
}
