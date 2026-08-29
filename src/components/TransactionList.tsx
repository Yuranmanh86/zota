import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { appTheme } from '../theme/appTheme';

type TransactionItem = {
  id: string;
  title: string;
  subtitle: string;
  amount: string;
  status: string;
};

type TransactionListProps = {
  title: string;
  items: TransactionItem[];
};

export function TransactionList({ title, items }: TransactionListProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={styles.content}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
            </View>
            <View style={styles.amountColumn}>
              <Text style={styles.amount}>{item.amount}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 22,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: appTheme.text,
    marginBottom: 14,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: appTheme.text,
  },
  itemSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 14,
    fontWeight: '800',
    color: appTheme.text,
  },
  status: {
    marginTop: 4,
    fontSize: 12,
    color: appTheme.primary,
    fontWeight: '700',
  },
  divider: {
    height: 12,
  },
});
